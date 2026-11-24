// Spike sync server: one SQLite-backed DO per path, fragmented storage (one SQL row per TinyBase row).
// MAX_SKEW env var (seconds) feeds createMergeableStore's v10.1 maxClockSkewSeconds; default 300.

import { createMergeableStore } from 'tinybase'
import { createDurableObjectSqlStoragePersister } from 'tinybase/persisters/persister-durable-object-sql-storage'
import { WsServerDurableObject, getWsServerDurableObjectFetch } from 'tinybase/synchronizers/synchronizer-ws-server-durable-object'

export class SyncDO extends WsServerDurableObject {
  createPersister() {
    const skew  = this.env.MAX_SKEW ? Number(this.env.MAX_SKEW) : undefined
    const store = createMergeableStore(undefined, undefined, skew)
    return createDurableObjectSqlStoragePersister(store, this.ctx.storage.sql, { mode: 'fragmented' }, undefined, e => console.log('persister ignored', String(e)))
  }

  // Debug hook: SQLite size of this DO (wrangler dev only)
  async fetch(request) {
    if (new URL(request.url).pathname === '/__size') {
      const sql = this.ctx.storage.sql
      const tables = [...sql.exec("SELECT name FROM sqlite_master WHERE type='table'")].map(r => r.name)
      const counts = Object.fromEntries(tables.map(t => [t, [...sql.exec(`SELECT count(*) AS n FROM "${t}"`)][0].n]))
      return Response.json({ databaseSize: sql.databaseSize, counts })
    }
    return super.fetch(request)
  }

  onIgnoredError(error) { console.log('DO ignored', String(error?.message ?? error)) }
}

const wsFetch = getWsServerDurableObjectFetch('SYNC')

export default {
  async fetch(request, env) {
    const url = new URL(request.url)

    // Debug: DO SQLite size for a path
    if (url.pathname.startsWith('/__size/')) {
      const stub = env.SYNC.get(env.SYNC.idFromName(url.pathname.slice('/__size/'.length)))
      return stub.fetch(new Request('https://do/__size'))
    }
    return wsFetch(request, env)
  },
}
