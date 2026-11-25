import { createMergeableStore } from 'tinybase'
import { createDurableObjectSqlStoragePersister } from 'tinybase/persisters/persister-durable-object-sql-storage'
import { WsServerDurableObject } from 'tinybase/synchronizers/synchronizer-ws-server-durable-object'
import { export_json } from '@dolist/store'

// Internal header the Worker sets after authenticating; clients can't reach the DO directly
export const SESSION_HEADER = `x-dolist-session`

// Clients fragment at 256 KB (see packages/store sync), so anything near 1 MB is abuse
export const FRAGMENT_SIZE = 256 * 1024
const MAX_MESSAGE = 1024 * 1024

// Backups live beside the store in this DO's SQLite: 30 kept, chunked under SQLite's 2 MB value cap
const KEEP_SNAPSHOTS = 30
const CHUNK = 1024 * 1024

// Close code the client reads as "this device was signed out"
export const REVOKED = 4401

/**
 * One owner's synced store: TinyBase WsServerDurableObject in hub mode (authorize is overridden),
 * fragmented SQLite (one SQL row per TinyBase row).
 */
export class Sync extends WsServerDurableObject {

    createPersister() {
        // Same as clients: no skew guard, so a fast device's edits converge instead of vanishing
        this.store = createMergeableStore( undefined, undefined, Infinity )
        return createDurableObjectSqlStoragePersister( this.store, this.ctx.storage.sql, { mode: `fragmented` }, undefined, error => this.onIgnoredError( error ) )
    }

    getFragmentSize() {
        return FRAGMENT_SIZE
    }

    // TinyBase drops a message whose fragments take longer than this (default 1 s): too tight for phones
    getRequestTimeoutSeconds() {
        return 30
    }

    // Each socket remembers its session so revoke can find it. Revoked sessions stay fenced out,
    // so an upgrade the Worker authenticated just before a revoke can't slip in after it
    async authorize( path_id, request ) {
        const session = request.headers.get( SESSION_HEADER )
        if( !session || await this.ctx.storage.get( `revoked:${ session }` ) ) return undefined
        return { context: { session } }
    }

    webSocketMessage( client, message ) {
        const size = typeof message === `string` ? message.length : message.byteLength
        if( size > MAX_MESSAGE ) return client.close( 1009, `Message too big` )
        return super.webSocketMessage( client, message )
    }

    onIgnoredError( error ) {
        console.warn( `sync:`, error?.message ?? error )
    }

    // ── RPC ──────────────────────────────────────────────────────────────────

    /**
     * Closes every socket opened by a session.
     * @param {string} session_id
     * @returns {number} sockets closed
     */
    async revoke( session_id ) {
        await this.ctx.storage.put( `revoked:${ session_id }`, Date.now() )
        const sockets = this.ctx.getWebSockets().filter( socket => socket.deserializeAttachment()?.context?.session === session_id )
        sockets.forEach( socket => socket.close( REVOKED, `Signed out` ) )
        return sockets.length
    }

    // ── Backups ──────────────────────────────────────────────────────────────

    snapshot_tables() {
        this.ctx.storage.sql.exec( `CREATE TABLE IF NOT EXISTS snapshots ( name TEXT PRIMARY KEY, uploaded INTEGER, size INTEGER )` )
        this.ctx.storage.sql.exec( `CREATE TABLE IF NOT EXISTS snapshot_chunks ( name TEXT, seq INTEGER, data TEXT, PRIMARY KEY ( name, seq ) )` )
        return this.ctx.storage.sql
    }

    /**
     * Saves the whole store as a Dolist export (the format Settings imports) and prunes to the newest 30.
     * @returns {string} the backup's name
     */
    take_snapshot() {
        const sql = this.snapshot_tables()
        const json = export_json( this.store )
        const now = new Date()
        const name = `${ now.toISOString() }.json`

        this.ctx.storage.transactionSync( () => {
            sql.exec( `INSERT OR REPLACE INTO snapshots VALUES ( ?, ?, ? )`, name, now.getTime(), json.length )
            for( let seq = 0; seq * CHUNK < json.length; seq++ ) {
                sql.exec( `INSERT OR REPLACE INTO snapshot_chunks VALUES ( ?, ?, ? )`, name, seq, json.slice( seq * CHUNK, ( seq + 1 ) * CHUNK ) )
            }
            const stale = sql.exec( `SELECT name FROM snapshots ORDER BY name DESC LIMIT -1 OFFSET ?`, KEEP_SNAPSHOTS ).toArray()
            stale.forEach( ( { name } ) => {
                sql.exec( `DELETE FROM snapshots WHERE name = ?`, name )
                sql.exec( `DELETE FROM snapshot_chunks WHERE name = ?`, name )
            } )
        } )
        return name
    }

    /**
     * @returns {{ name: string, uploaded: string, size: number }[]} newest first
     */
    snapshots() {
        return this.snapshot_tables().exec( `SELECT name, uploaded, size FROM snapshots ORDER BY name DESC` ).toArray()
            .map( ( { name, uploaded, size } ) => ( { name, uploaded: new Date( uploaded ).toISOString(), size } ) )
    }

    /**
     * @param {string} name
     * @returns {string|null} the backup's JSON
     */
    read_snapshot( name ) {
        const chunks = this.snapshot_tables().exec( `SELECT data FROM snapshot_chunks WHERE name = ? ORDER BY seq`, name ).toArray()
        return chunks.length ? chunks.map( ( { data } ) => data ).join( `` ) : null
    }

}
