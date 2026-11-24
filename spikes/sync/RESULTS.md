# M0 spike A: TinyBase MergeableStore sync

**Verdict: GO with caveats.** Merge semantics, DO server, BC tabs and kill-safety all work. Stock IndexedDB persister fails the write budget at 10k → ship our own incremental persister (`src/idb-incremental.js`, ~130 LOC, passes). Clock skew and first-sync payload need design work, not a different stack.

## Setup

- **TinyBase 10.1.0** (latest stable, 2026-11-12; 10.2.0-beta.1 exists). Plan says ≥ 9.6 → **bump to ≥ 10.1**: adds skew guard, DO `authorize`/`canWriteCell`, and fixes WsSynchronizer going deaf after in-place reconnect (broken 10.0.x).
- APIs confirmed in 10.1 types: `createMergeableStore(id?, getNow?, maxClockSkewSeconds?)`, `createIndexedDbPersister(store, db, autoLoadSec?, onIgnoredError?)`, `createBroadcastChannelSynchronizer(store, channel, …)`, `createWsSynchronizer(store, ws, timeoutSec?, …, fragmentSize?, maxBufferSize?)`, `WsServerDurableObject` + `getWsServerDurableObjectFetch(bindingName)`, `createDurableObjectSqlStoragePersister(store, sql, {mode:'fragmented'})`.
- Fixture: plan §2.1 schema, 10k tasks → **32,411 rows** (tasks, task_labels, completions, orders, meta). Plain JSON 3.3 MB, mergeable JSON **6.3 MB**.
- Box: Ryzen AI Max+ 395 (fast). Headless Chrome via puppeteer-core, Vite prod build. **4× CDP CPU throttle ≈ "mid laptop"**, that's the column that counts. Server: `wrangler dev --local` (workerd, SQLite DO), Node `ws` clients, no network latency.
- `stock` = `createIndexedDbPersister`. `inc` = `src/idb-incremental.js` (custom persister: 1 IDB record per row, hashes persisted, writes only changed rows).

## Browser: metric vs budget

| Metric | Budget | stock 1× | stock 4× | inc 1× | inc 4× |
|---|---|---|---|---|---|
| Cold hydrate, nav start → store ready + lane query (p50, fresh browser process) | ≤ 1.5 s total interactive | 331 ms | 1156 ms ⚠️ | 483 ms | 1426 ms ⚠️ |
| Main-thread long task during hydrate | — | ~200 ms | ~750 ms | none | ~75 ms |
| Write → IDB commit ack (p50 / p95, n=30) | ≤ 100 ms | 58 / 68 | **230 / 291 ❌** | 0.2 / 0.4 ✅ | 0.8 / 2.4 ✅ |
| Main-thread block per write | 60 fps | ~55 ms | **~170 ms long task every write ❌** | < 1 ms | < 1 ms |
| Kill browser (SIGKILL) right after ack → present on reload | 100% | 10/10 ✅ | 10/10 ✅ | 10/10 ✅ | 10/10 ✅ |
| Kill *before* ack (no wait) | — | 0/10 | 0/10 | 0/10 | 0/10 |
| 2 tabs via BC: A write → B sees it (p50 / p95) | — | 14 / 18 ms | 28 / 53 ms | 0.1 / 2 ms | 1 / 63 ms |
| 2 tabs: concurrent field edits converge | yes | ✅ | ✅ | ✅ | ✅ |
| IDB usage | — | 2.5 MB | 2.5 MB | 9.8 MB | 9.8 MB |

⚠️ Hydrate passes at 4× but leaves ~100–350 ms for React + first lane render. Tight; verify on a real mid laptop.

## Server: Worker + `WsServerDurableObject` (SQLite, fragmented)

| Metric | Result |
|---|---|
| 10k upload into empty DO | uploader sent **10.1 MB** (≈ 2× payload, surprise) |
| Fresh client pulls 10k | **5.0 MB** received, 2.35 s connect → all rows (local, no RTT) |
| Single cell edit propagation | 21 ms, **9.4 KB** sent by editor (bucket hash exchange) |
| Reconnect, nothing changed | 61 B up / 137 B down |
| Reconnect after 100 remote edits | 119 ms, 15 KB up / 139 KB down |
| DO SQLite size | **9.3 MB**, 32,411 SQL rows (1 per TinyBase row) |
| Offline edits, different fields of same task | per-field merge ✅ (A's `priority` + B's `notes` both kept) |
| Offline edits, same field | later HLC wins ✅, all clients + fresh client identical, 20 ms after reconnect |
| Offline row creates on both sides + tombstone | all merged ✅ |

### Clock skew (B's clock +10 min; B edits first in real time, A edits later)

| Server + client `maxClockSkewSeconds` | Outcome |
|---|---|
| default **300** | Server and peer A **refuse all of B's offline changes**, incl. the non-conflicting `notes` (A logs `tinybase:18`). B keeps its values → **silent divergence**. Server's `onIgnoredError` logged nothing. |
| 300, B skew = 310 s, wait 15 s, B resyncs | Once real time is within 300 s of B's stamps, B's stale edits are **accepted and win retroactively** over A's later edit. All converge. |
| `Infinity` | Pure HLC LWW: B's earlier edit wins over A's later one immediately. Converges. |

Takeaway: skew guard bounds damage (no clock hijack), but a fast device's offline edits vanish for (skew − 300 s), then overwrite newer data. Fix with a server time offset (below).

## Surprises

1. **Stock IDB persister rewrites the whole store per save** (one ~6 MB `put` of the mergeable tree). Fine at 1k, fails at 10k. Also its autoload polls every 1 s with full `getAll` + `JSON.stringify` of everything (~4% CPU idle at 1×).
2. `getPersisted` may return `MergeableChanges` (`[…, 1]`); TinyBase applies via `applyMergeableChanges` but that's **~3× slower** (2.5 s load, 2.8 s long task at 4×) than handing it hashed `MergeableContent`. Persisting hashes fixed it.
3. Upload of a full store sends ~2× its size.
4. One-cell edit costs ~9 KB on the wire.
5. Skew-refused changes are invisible server-side (only peers' `onIgnoredError` fire).
6. Chrome IDB default durability is `relaxed` (no fsync): survives tab/browser kill (measured), not OS crash/power loss. `durability: 'strict'` cost ~1 ms here.
7. `setContent` of 10k rows blocks 1.1 s (1×) / 4.2 s (4×). Import/seed path must batch or run in a worker.

## Recommendation for `packages/store`

- **Go**, TinyBase ≥ 10.1. Keep the fallback (own op-log) shelved.
- **Own IDB persister** (start from `src/idb-incremental.js`). Consider a hybrid: snapshot blob (stock-fast load) + per-row journal, compacted on idle, to buy hydrate headroom. Use `durability: 'strict'` for capture.
- **Never** `startAutoPersisting()` on stock IDB persister; `load()` → `startAutoSave()`; tabs via BroadcastChannel.
- **Clock**: `getNow = () => Date.now() + serverOffset`, offset from the auth/handshake response; keep default 300 s guard; surface `tinybase:18` in telemetry + a "device clock is off" hint.
- **First sync**: 5 MB uncompressed JSON on first login. Bootstrap via gzipped HTTP snapshot from the DO, then WS for deltas (or test WS compression on real Workers, untested here).
- Hydrate is the budget at risk; measure with real React render on a real mid laptop in M1.

## API gotchas

- `createMergeableStore` 3rd arg (`maxClockSkewSeconds`) is new in 10.1, default 300; `Infinity` disables.
- `startAutoSave()` always does a full save first (stock: ~225 ms at 4×). The custom persister skips it right after loading into an empty store.
- Ack = persister status listener 2 → 0 (or `await persister.save()`); resolves after IDB `oncomplete` (v9.3+).
- Hash helpers are exported from `tinybase`: `getCellHash`, `getRowHash`, `getTableHash`, `getTablesHash`, `getValuesHash` (XOR-based, so incremental-friendly). Row/table HLC in content can be `''`.
- No null cells: Inbox `project_id` = `''` or absent cell.
- `getContent()` key order differs between converged stores; compare canonically or via `getMergeableContentHashes()`.
- DO wiring: class exported from entry, name == `class_name`, `getWsServerDurableObjectFetch('<binding name>')` (not class), `new_sqlite_classes` migration. One DO per URL path; shared sockets / channel ids unsupported on DO.
- `getWsServerDurableObjectFetch` does no auth and routes `idFromName(path)`. M2: own `fetch` that authenticates and rewrites path → user id; override `authorize` / `canWriteCell` (makes `fetch` async, so `await super.fetch()`).
- Client ids come from `Sec-WebSocket-Key`: change per reconnect, not identities.
- Raw WebSocket doesn't reconnect: `ReconnectingWebSocket` + on `open`: `sync.load().then(() => sync.save())`. Spike recreated synchronizers instead.
- DO relays client→client *and* merges into its own store; each peer applies its own skew check.

## Reproduce

```sh
cd spikes/sync && npm i
npm run build && npx vite preview &            # :4174
node bench/browser.mjs 4 inc                   # throttle, persister (stock|inc)
npm run worker &                               # :8788, add --var MAX_SKEW:Infinity to disable guard
node bench/ws.mjs all                          # load | merge | skew; CLIENT_SKEW=Infinity for clients
```
