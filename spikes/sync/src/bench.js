// Browser bench. Driven by bench/browser.mjs via query params + window.bench.
//
//   ?mode=seed&n=10000      wipe IDB, write fixture, report sizes
//   ?mode=app               hydrate from IDB (+ BroadcastChannel when &bc=1), report timings
//   &autoload=1             also start the persister's 1 s IDB polling (default: off)

import { createMergeableStore }               from 'tinybase'
import { createIndexedDbPersister }           from 'tinybase/persisters/persister-indexed-db'
import { createBroadcastChannelSynchronizer } from 'tinybase/synchronizers/synchronizer-broadcast-channel'
import { tablesSchema, generate }             from './fixture.js'
import { createIncrementalIdbPersister }      from './idb-incremental.js'

const T_MODULE = performance.now()   // ms since navigation start: HTML + module graph loaded
const params   = new URLSearchParams(location.search)
const mode     = params.get('mode') ?? 'app'
const KIND     = params.get('persister') ?? 'stock'   // stock | inc
const DB       = `dolist-spike-${KIND}`

// stock = tinybase createIndexedDbPersister; inc = our per-row incremental one
const makePersister = (store, autoLoadSeconds = 3600) => KIND === 'inc'
  ? createIncrementalIdbPersister(store, DB, console.warn, { durability: params.get('durability') ?? 'default' })
  : createIndexedDbPersister(store, DB, autoLoadSeconds, console.warn)

const out = msg => (document.getElementById('out').textContent = JSON.stringify(msg, null, 2))
const now = () => performance.timeOrigin + performance.now()   // cross-tab comparable

// Long tasks (>50 ms main-thread blocks) collected for every phase
const longTasks = []
new PerformanceObserver(list => longTasks.push(...list.getEntries().map(e => Math.round(e.duration))))
  .observe({ type: 'longtask', buffered: true })

const makeStore = () => createMergeableStore().setTablesSchema(tablesSchema)


// A "board query": Inbox lane, sorted by rank, first 50. Stand-in for first paint work.
const boardQuery = store => {
  const orders = store.getTable('orders')
  return Object.keys(orders)
    .filter(key => key.startsWith('inbox:'))
    .sort((a, b) => (orders[a].rank < orders[b].rank ? -1 : 1))
    .slice(0, 50)
    .map(key => store.getRow('tasks', key.slice(6)))
}


/**
 * Resolve when the persister finishes its next save (status 2 → 0).
 * This is our "durable local ack": IDB transaction oncomplete has fired.
 */
const nextSaveDone = persister => new Promise(resolve => {
  let saving = false
  const id = persister.addStatusListener((_, status) => {
    if (status === 2) saving = true
    if (status === 0 && saving) { persister.delListener(id); resolve() }
  })
})


const seed = async () => {
  await new Promise(r => { const req = indexedDB.deleteDatabase(DB); req.onsuccess = req.onerror = req.onblocked = r })

  const n = Number(params.get('n') ?? 10_000)
  let t = performance.now()
  const { content, ids } = generate(n)
  const tGen = performance.now() - t

  const store = makeStore()
  t = performance.now()
  store.setContent(content)
  const tSet = performance.now() - t

  const persister = makePersister(store)
  t = performance.now()
  await persister.save()
  const tSave = performance.now() - t

  const plainBytes     = JSON.stringify(store.getContent()).length
  const mergeableBytes = JSON.stringify(store.getMergeableContent()).length
  const estimate       = await navigator.storage.estimate()

  localStorage.ids = JSON.stringify(ids.slice(0, 200))
  return { n, tGen, tSet, tSave, plainBytes, mergeableBytes, idbUsage: estimate.usage, longTasks }
}


const app = async () => {
  const store     = makeStore()
  const persister = makePersister(store, params.get('autoload') === '1' ? 1 : 3600)

  // load() then autosave. startAutoPersisting() would also start autoLoad polling.
  const t0 = performance.now()
  await persister.load()
  const tLoaded = performance.now()
  if (params.get('autoload') === '1') await persister.startAutoLoad()
  await persister.startAutoSave()

  let synchronizer
  if (params.get('bc') === '1') {
    synchronizer = createBroadcastChannelSynchronizer(store, DB + '-bc')
    await synchronizer.startSync()
  }

  const lane     = boardQuery(store)
  const tReady   = performance.now()
  const ids      = JSON.parse(localStorage.ids ?? '[]')

  // Exposed to puppeteer
  window.bench = {
    store, persister, synchronizer,

    // One field write → resolves at IDB commit. Returns ms.
    write: async (rowId, cellId, value) => {
      const done = nextSaveDone(persister)
      const t = performance.now()
      store.setCell('tasks', rowId, cellId, value)
      const tSync = performance.now() - t
      await done
      return { ack: performance.now() - t, sync: tSync }
    },

    // Write without waiting; used for the "kill immediately" test
    writeNoWait: (rowId, cellId, value) => { store.setCell('tasks', rowId, cellId, value); return true },

    get: (rowId, cellId) => store.getCell('tasks', rowId, cellId),

    // Resolve (with wall-clock ts) when a cell reaches a value; used for cross-tab convergence
    waitFor: (rowId, cellId, value) => new Promise(resolve => {
      if (store.getCell('tasks', rowId, cellId) === value) return resolve(now())
      const id = store.addCellListener('tasks', rowId, cellId, () => {
        if (store.getCell('tasks', rowId, cellId) === value) { store.delListener(id); resolve(now()) }
      })
    }),

    now,
    longTasks,
    ids,
    taskCount: () => store.getRowCount('tasks'),
  }

  return {
    tModule: T_MODULE,                 // nav start → module evaluated
    tLoad:   tLoaded - t0,             // IDB read + store hydrate
    tReady,                            // nav start → store ready + lane query (the budget number)
    tasks:   store.getRowCount('tasks'),
    lane:    lane.length,
    longTasks: [...longTasks],
  }
}


const result = await (mode === 'seed' ? seed() : app()).catch(e => ({ error: String(e), stack: e.stack }))
window.result = result
out(result)
