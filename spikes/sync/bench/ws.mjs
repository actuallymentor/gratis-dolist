// WS sync scenarios against `wrangler dev` (WsServerDurableObject + DO SQLite).
//   node bench/ws.mjs [load|merge|skew|all]   (WS=ws://localhost:8788)
import WebSocket from 'ws'
import { createMergeableStore } from 'tinybase'
import { createWsSynchronizer } from 'tinybase/synchronizers/synchronizer-ws-client'
import { tablesSchema, generate } from '../src/fixture.js'

const WS    = process.env.WS ?? 'ws://localhost:8788'
const HTTP  = WS.replace(/^ws/, 'http')
const RUN   = Date.now().toString(36)
const which = process.argv[2] ?? 'all'
// maxClockSkewSeconds for clients (v10.1, default 300); pair with server MAX_SKEW var
const CLIENT_SKEW = process.env.CLIENT_SKEW ? Number(process.env.CLIENT_SKEW) : undefined

const sleep = ms => new Promise(r => setTimeout(r, ms))

const until = async (pred, timeout = 30_000, step = 20) => {
  const t0 = performance.now()
  while (!pred()) {
    if (performance.now() - t0 > timeout) throw new Error('timeout waiting for convergence ' + (until.debug?.() ?? ''))
    await sleep(step)
  }
  return performance.now() - t0
}


// A client = MergeableStore + (re)connectable WsSynchronizer with byte counters
const client = (name, { skewMs = 0 } = {}) => {
  const errors = []
  const store  = createMergeableStore(name, () => Date.now() + skewMs, CLIENT_SKEW).setTablesSchema(tablesSchema)
  const bytes  = { sent: 0, received: 0 }
  let sync

  return {
    name, store, bytes, errors,

    async connect(path) {
      const ws = new WebSocket(`${WS}/${path}`)
      const send = ws.send.bind(ws)
      ws.send = (data, ...rest) => { bytes.sent += Buffer.byteLength(data); send(data, ...rest) }
      ws.on('message', data => (bytes.received += data.length))
      await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject) })
      sync = await createWsSynchronizer(store, ws, 10, undefined, undefined, e => errors.push(String(e?.message ?? e)))
      await sync.startSync()
      return this
    },

    async disconnect() { await sync?.destroy(); sync = undefined },

    row: id => store.getRow('tasks', id),
  }
}

const size = async path => (await fetch(`${HTTP}/__size/${path}`)).json()
// Key order differs between stores; compare canonically
const canon = x => x && typeof x === 'object' ? `{${Object.keys(x).sort().map(k => `${k}:${canon(x[k])}`).join(',')}}` : JSON.stringify(x)
const same  = (...clients) => new Set(clients.map(c => canon(c.store.getContent()))).size === 1

const report = {}


// 1. Initial sync payload: 10k up to an empty DO, then 10k down to a fresh client
if (which === 'load' || which === 'all') {
  const path = `load-${RUN}`
  const { content } = generate(10_000)

  const up = client('uploader')
  up.store.setContent(content)
  const mergeableBytes = JSON.stringify(up.store.getMergeableContent()).length

  let t = performance.now()
  await up.connect(path)
  const tConnectUp = performance.now() - t
  // Upload is done when a second, empty client can pull all of it
  const down = client('downloader')
  t = performance.now()
  await down.connect(path)
  await until(() => down.store.getRowCount('tasks') === 10_000 && same(up, down), 60_000)
  const tDown = performance.now() - t   // connect + full pull
  await sleep(500)

  // Incremental: one cell edit after both are synced
  const before = { ...up.bytes }, beforeDown = { ...down.bytes }
  const id = Object.keys(content[0].tasks)[5]
  t = performance.now()
  up.store.setCell('tasks', id, 'title', 'one small edit')
  const tEdit = await until(() => down.store.getCell('tasks', id, 'title') === 'one small edit')

  // Reconnect with nothing changed: cost of the hash handshake
  await down.disconnect()
  const beforeRe = { ...down.bytes }
  t = performance.now()
  await down.connect(path)
  await sleep(1000)
  const reBytes = { sent: down.bytes.sent - beforeRe.sent, received: down.bytes.received - beforeRe.received }

  // Reconnect after 100 offline edits elsewhere
  await down.disconnect()
  Object.keys(content[0].tasks).slice(100, 200).forEach((id, i) => up.store.setCell('tasks', id, 'priority', (i % 4) + 1))
  await sleep(300)
  const before100 = { ...down.bytes }
  t = performance.now()
  await down.connect(path)
  const t100 = await until(() => same(up, down))
  const re100 = { sent: down.bytes.sent - before100.sent, received: down.bytes.received - before100.received }

  report.load = {
    mergeableJsonBytes: mergeableBytes,
    upload:   { tConnectStartSync: Math.round(tConnectUp), bytes: { ...up.bytes, sent: before.sent } },
    download: { tUntilAll10k: Math.round(tDown), bytes: beforeDown },
    singleEdit: { tPropagate: Math.round(tEdit), upSent: up.bytes.sent - before.sent },
    reconnectNoChanges: reBytes,
    reconnectAfter100Edits: { t: Math.round(t100), bytes: re100 },
    doStorage: await size(path),
    errors: [...up.errors, ...down.errors],
  }
  await up.disconnect(); await down.disconnect()
}


// 2. Offline concurrent edits → per-field merge
if (which === 'merge' || which === 'all') {
  const path = `merge-${RUN}`
  const a = client('A'), b = client('B')
  a.store.setRow('tasks', 't1', { title: 'orig', notes: '', priority: 4, created_at: 1 })
  await a.connect(path); await b.connect(path)
  await until(() => same(a, b))

  await a.disconnect(); await b.disconnect()

  // Offline. A: title + priority. B (later): title + notes.
  a.store.setPartialRow('tasks', 't1', { title: 'A title', priority: 1 })
  await sleep(50)
  b.store.setPartialRow('tasks', 't1', { title: 'B title', notes: 'B notes' })
  // Different row created offline on each side
  a.store.setRow('tasks', 'tA', { title: 'made on A', created_at: 2 })
  b.store.setRow('tasks', 'tB', { title: 'made on B', created_at: 3 })
  // Delete-vs-edit: A tombstones, B edits
  a.store.setCell('tasks', 'tA', 'deleted_at', 99)

  // Reconnect in reverse order of editing
  await b.connect(path); await sleep(300)
  await a.connect(path)
  until.debug = () => JSON.stringify({ a: a.store.getTable('tasks'), b: b.store.getTable('tasks'), ea: a.errors, eb: b.errors })
  const t = await until(() => same(a, b), 5000)
  const c = await client('C').connect(path)
  await until(() => same(a, c))

  report.merge = {
    tConverge: Math.round(t),
    t1: a.row('t1'),
    expected: { title: 'B title (later HLC)', priority: 1, notes: 'B notes' },
    tA: a.row('tA'), tB: a.row('tB'),
    freshClientMatches: same(a, b, c),
    errors: [...a.errors, ...b.errors, ...c.errors],
  }
  await a.disconnect(); await b.disconnect(); await c.disconnect()
}


// 3. Clock skew: B's clock is +10 min. B edits first (real time), A edits later.
if (which === 'skew' || which === 'all') {
  const skewCase = async (label, skewMs, waitAfterMs = 0) => {
    const path = `skew-${label}-${RUN}`
    const a = client('A'), b = client('B', { skewMs })
    a.store.setRow('tasks', 't1', { title: 'orig', notes: '', priority: 4, created_at: 1 })
    await a.connect(path); await b.connect(path)
    await until(() => same(a, b))
    await a.disconnect(); await b.disconnect()

    b.store.setPartialRow('tasks', 't1', { title: 'B (fast clock, earlier)', notes: 'B notes' })
    await sleep(100)
    a.store.setPartialRow('tasks', 't1', { title: 'A (true clock, later)', priority: 1 })

    await a.connect(path); await b.connect(path)
    await sleep(2000)
    const result = { a: a.row('t1'), b: b.row('t1'), converged: same(a, b) }

    // Fresh client: what does the server hold?
    const c = await client('C').connect(path); await sleep(1000)
    result.server = c.row('t1')
    await c.disconnect()

    if (waitAfterMs) {
      // Let real time catch up past the 300 s threshold, then nudge B to sync again
      await sleep(waitAfterMs)
      await b.disconnect(); await b.connect(path); await sleep(2000)
      const c2 = await client('C2').connect(path); await sleep(1000)
      result.afterWait = { a: a.row('t1'), b: b.row('t1'), server: c2.row('t1'), converged: same(a, b, c2) }
      await c2.disconnect()
    }
    result.errors = { a: [...new Set(a.errors)], b: [...new Set(b.errors)] }
    await a.disconnect(); await b.disconnect()
    return result
  }

  report.skew = {
    plus10min: await skewCase('10m', 600_000),
    // 310 s skew: refused at first, accepted once 10+ s pass
    plus310s_thenWait15s: await skewCase('310s', 310_000, 15_000),
  }
}

console.log(JSON.stringify(report, null, 2))
process.exit(0)
