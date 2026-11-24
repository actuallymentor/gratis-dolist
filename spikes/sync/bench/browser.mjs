// Drives the browser bench in headless Chrome. Assumes `vite preview` on :4174.
//   node bench/browser.mjs [cpuThrottle=1]
import puppeteer from 'puppeteer-core'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const BASE     = process.env.BASE ?? 'http://localhost:4174/'
const THROTTLE = Number(process.argv[2] ?? 1)
const KIND     = process.argv[3] ?? 'stock'
const profile  = mkdtempSync(join(process.env.SCRATCH ?? tmpdir(), 'chrome-'))

const launch = () => puppeteer.launch({
  executablePath: '/usr/bin/google-chrome',
  headless: true,
  userDataDir: profile,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
})

const open = async (browser, query) => {
  const page = await browser.newPage()
  page.on('pageerror', e => console.error('pageerror', e.message))
  page.on('console', m => m.type() === 'warn' || m.type() === 'error' ? console.error('console', m.text()) : 0)
  if (THROTTLE > 1) {
    const cdp = await page.createCDPSession()
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE })
  }
  await page.goto(`${BASE}?${query}&persister=${KIND}`)
  await page.waitForFunction('window.result', { timeout: 60_000 })
  const result = await page.evaluate('window.result')
  if (result.error) throw new Error(result.stack)
  return { page, result }
}

const stats = xs => {
  const s = [...xs].sort((a, b) => a - b)
  const q = p => s[Math.min(s.length - 1, Math.floor(p * s.length))]
  return { n: s.length, min: +s[0].toFixed(1), p50: +q(0.5).toFixed(1), p95: +q(0.95).toFixed(1), max: +s.at(-1).toFixed(1) }
}

const kill = browser => { browser.process().kill('SIGKILL'); return new Promise(r => setTimeout(r, 300)) }

const report = { throttle: THROTTLE, persister: KIND }


// 1. Seed ------------------------------------------------------------------
{
  const browser = await launch()
  const { result } = await open(browser, 'mode=seed&n=10000')
  report.seed = result
  await browser.close()
}


// 2. Cold hydration: fresh browser process each time ------------------------
{
  const runs = []
  for (let i = 0; i < 5; i++) {
    const browser = await launch()
    const { result } = await open(browser, 'mode=app')
    runs.push(result)
    await browser.close()
  }
  report.hydrate = {
    tReady: stats(runs.map(r => r.tReady)),
    tLoad:  stats(runs.map(r => r.tLoad)),
    tModule: stats(runs.map(r => r.tModule)),
    tasks: runs[0].tasks,
    longTasks: runs.map(r => r.longTasks),
  }
}


// 3. Write → durable ack ----------------------------------------------------
{
  const browser = await launch()
  const { page } = await open(browser, 'mode=app')
  const res = []
  for (let i = 0; i < 30; i++) {
    res.push(await page.evaluate(i => {
      const id = window.bench.ids[i % window.bench.ids.length]
      return window.bench.write(id, 'title', `edited ${i} ${Date.now()}`)
    }, i))
  }
  // explicit full save cost for reference
  const save = await page.evaluate(async () => { const t = performance.now(); await window.bench.persister.save(); return performance.now() - t })
  report.write = {
    ack:  stats(res.map(r => r.ack)),
    sync: stats(res.map(r => r.sync)),
    explicitSave: +save.toFixed(1),
    longTasks: await page.evaluate('window.bench.longTasks.slice(-40)'),
  }
  await browser.close()
}


// 4. Kill after ack / kill immediately -------------------------------------
{
  const trial = async waitAck => {
    let browser = await launch()
    const { page } = await open(browser, 'mode=app')
    const marker = `kill-${waitAck ? 'ack' : 'now'}-${Math.random()}`
    const id = await page.evaluate('window.bench.ids[7]')
    if (waitAck) await page.evaluate((id, m) => window.bench.write(id, 'notes', m), id, marker)
    else         await page.evaluate((id, m) => window.bench.writeNoWait(id, 'notes', m), id, marker)
    await kill(browser)

    browser = await launch()
    const { page: p2 } = await open(browser, 'mode=app')
    const ok = (await p2.evaluate(id => window.bench.get(id, 'notes'), id)) === marker
    await browser.close()
    return ok
  }
  const afterAck = [], immediate = []
  for (let i = 0; i < 10; i++) afterAck.push(await trial(true))
  for (let i = 0; i < 10; i++) immediate.push(await trial(false))
  report.kill = {
    afterAck:  `${afterAck.filter(Boolean).length}/10`,
    immediate: `${immediate.filter(Boolean).length}/10`,
  }
}


// 5. Two tabs via BroadcastChannel -----------------------------------------
{
  const browser = await launch()
  const { page: a, result: ra } = await open(browser, 'mode=app&bc=1')
  const { page: b, result: rb } = await open(browser, 'mode=app&bc=1')
  const id = await a.evaluate('window.bench.ids[3]')

  // A → B propagation latency
  const lat = []
  for (let i = 0; i < 10; i++) {
    const v = `bc-${i}-${Math.random()}`
    const seen = b.evaluate((id, v) => window.bench.waitFor(id, 'title', v), id, v)
    const t0 = await a.evaluate((id, v) => { const t = window.bench.now(); window.bench.writeNoWait(id, 'title', v); return t }, id, v)
    lat.push((await seen) - t0)
  }

  // Concurrent different-field + same-field writes, then compare
  await Promise.all([
    a.evaluate(id => { window.bench.writeNoWait(id, 'title', 'from A'); window.bench.writeNoWait(id, 'priority', 1) }, id),
    b.evaluate(id => { window.bench.writeNoWait(id, 'title', 'from B'); window.bench.writeNoWait(id, 'notes', 'B notes') }, id),
  ])
  await new Promise(r => setTimeout(r, 1000))
  const rowA = await a.evaluate(id => window.bench.store.getRow('tasks', id), id)
  const rowB = await b.evaluate(id => window.bench.store.getRow('tasks', id), id)
  const hashA = await a.evaluate('window.bench.store.getMergeableContentHashes?.() ?? null').catch(() => null)
  const fullEq = await a.evaluate('JSON.stringify(window.bench.store.getContent())') === await b.evaluate('JSON.stringify(window.bench.store.getContent())')

  report.broadcast = {
    tabBReady: +rb.tReady.toFixed(1),
    tabAReady: +ra.tReady.toFixed(1),
    latency: stats(lat),
    rowA, rowB,
    rowConverged: JSON.stringify(rowA) === JSON.stringify(rowB),
    fullContentEqual: fullEq,
  }
  void hashA
  await browser.close()
}


console.log(JSON.stringify(report, null, 2))
rmSync(profile, { recursive: true, force: true })
