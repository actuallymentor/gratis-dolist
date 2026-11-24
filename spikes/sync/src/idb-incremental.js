// Incremental IndexedDB persister for a MergeableStore: one IDB record per row,
// only changed rows are touched on save. Stock createIndexedDbPersister rewrites
// the entire mergeable tree (one ~6 MB record for 10k tasks) on every save.
//
// Record: key [tableId, rowId] → { c: { cellId: [value, hlc, hash] }, h: rowHash }
//         key ['', valueId]    → [value, hlc, hash]      (values store)
//
// Hashes are persisted so load can hand TinyBase a full, hashed MergeableContent
// (fast setMergeableContent path). Returning unhashed MergeableChanges also works
// but applyMergeableChanges is ~3x slower on 30k rows (measured: v1 of this file).

import { createCustomPersister } from 'tinybase/persisters'
import { getCellHash, getRowHash, getTableHash, getTablesHash, getValuesHash } from 'tinybase'

const ROWS = 'rows'
const VALS = 'values'


const openDb = name => new Promise((resolve, reject) => {
  const req = indexedDB.open(name, 1)
  req.onupgradeneeded = () => { req.result.createObjectStore(ROWS); req.result.createObjectStore(VALS) }
  req.onsuccess = () => resolve(req.result)
  req.onerror   = () => reject(req.error)
})

const done = tx => new Promise((resolve, reject) => {
  tx.oncomplete = resolve
  tx.onerror = tx.onabort = () => reject(tx.error)
})

const request = req => new Promise((resolve, reject) => {
  req.onsuccess = () => resolve(req.result)
  req.onerror   = () => reject(req.error)
})

const mapValues = (obj, fn) => Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, fn(v, k)]))
const hashesOf  = stamps => mapValues(stamps, ([, , hash]) => hash)


// durability: Chrome defaults to 'relaxed' (no fsync; survives tab/browser kill, not power loss)
export const createIncrementalIdbPersister = (store, name, onIgnoredError, { durability = 'default' } = {}) => {
  const dbPromise = openDb(name)

  // startAutoSave() always does a full save first. Right after loading into an
  // empty store, memory == disk, so that rewrite (~1 s at 4x CPU for 10k) is skipped.
  let justLoaded = false


  // Full read → hashed MergeableContent
  const getPersisted = async () => {
    const db = await dbPromise
    const tx = db.transaction([ROWS, VALS])
    const [keys, rows, valKeys, vals] = await Promise.all([
      request(tx.objectStore(ROWS).getAllKeys()),
      request(tx.objectStore(ROWS).getAll()),
      request(tx.objectStore(VALS).getAllKeys()),
      request(tx.objectStore(VALS).getAll()),
    ])
    if (!keys.length && !valKeys.length) return undefined
    justLoaded = store.getRowCount('tasks') === 0

    // tableId → { rowId: [cells, '', rowHash] }
    const tables = {}
    keys.forEach(([tableId, rowId], i) => {
      (tables[tableId] ??= {})[rowId] = [rows[i].c, '', rows[i].h]
    })
    const tableStamps = mapValues(tables, tableRows => [tableRows, '', getTableHash(mapValues(tableRows, ([, , h]) => h))])

    const values = {}
    valKeys.forEach(([, valueId], i) => (values[valueId] = vals[i]))

    return [
      [tableStamps, '', getTablesHash(mapValues(tableStamps, ([, , h]) => h))],
      [values, '', getValuesHash(hashesOf(values))],
    ]
  }


  // Merge changed cells into the stored row (read-modify-write inside the same tx)
  const mergeRow = (os, key, cellStamps) => {
    const req = os.get(key)
    req.onsuccess = () => {
      const cells = req.result?.c ?? {}
      for (const [cellId, [value, hlc]] of Object.entries(cellStamps)) {
        if (!cells[cellId] || hlc > cells[cellId][1]) cells[cellId] = [value, hlc, getCellHash(value, hlc)]
      }
      os.put({ c: cells, h: getRowHash(hashesOf(cells)) }, key)
    }
  }


  const setPersisted = async (getContent, changes) => {
    const db = await dbPromise
    const tx = db.transaction([ROWS, VALS], 'readwrite', { durability })
    const rows = tx.objectStore(ROWS)
    const vals = tx.objectStore(VALS)

    if (changes) {
      justLoaded = false
      // Incremental: unhashed [value, hlc] stamps for the touched cells only
      for (const [tableId, [tableRows]] of Object.entries(changes[0][0])) {
        for (const [rowId, [cells]] of Object.entries(tableRows)) mergeRow(rows, [tableId, rowId], cells)
      }
      for (const [valueId, [value, hlc]] of Object.entries(changes[1][0])) {
        vals.put([value, hlc, getCellHash(value, hlc)], ['', valueId])
      }
    } else if (justLoaded) {
      justLoaded = false
      return
    } else {
      // Full save (first save): mergeable content already carries hashes
      const [[tables], [values]] = getContent()
      rows.clear(); vals.clear()
      for (const [tableId, [tableRows]] of Object.entries(tables)) {
        for (const [rowId, [cells, , hash]] of Object.entries(tableRows)) rows.put({ c: cells, h: hash }, [tableId, rowId])
      }
      for (const [valueId, stamp] of Object.entries(values)) vals.put(stamp, ['', valueId])
    }

    await done(tx)
  }


  // No cross-tab polling: BroadcastChannelSynchronizer covers tabs
  return createCustomPersister(store, getPersisted, setPersisted, () => null, () => {}, onIgnoredError, 2 /* MergeableStoreOnly */)
}
