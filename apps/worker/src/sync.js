import { createMergeableStore } from 'tinybase'
import { createDurableObjectSqlStoragePersister } from 'tinybase/persisters/persister-durable-object-sql-storage'
import { WsServerDurableObject } from 'tinybase/synchronizers/synchronizer-ws-server-durable-object'
import { export_json } from '@dolist/store'

// Internal header the Worker sets after authenticating; clients can't reach the DO directly
export const SESSION_HEADER = `x-dolist-session`

// Clients fragment at 256 KB (see packages/store sync), so anything near 1 MB is abuse
export const FRAGMENT_SIZE = 256 * 1024
const MAX_MESSAGE = 1024 * 1024

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

    /**
     * The whole store as a Dolist export (same format Settings imports).
     * @returns {string}
     */
    snapshot() {
        return export_json( this.store )
    }

}
