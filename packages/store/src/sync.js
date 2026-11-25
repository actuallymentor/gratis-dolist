import { createWsSynchronizer } from 'tinybase/synchronizers/synchronizer-ws-client'

// Matches the server (apps/worker/src/sync.js)
const FRAGMENT_SIZE = 256 * 1024
export const REVOKED = 4401

const MIN_DELAY = 1_000
const MAX_DELAY = 30_000
const REQUEST_TIMEOUT = 10

/**
 * Keeps a MergeableStore synced over WebSocket, reconnecting with backoff (TinyBase's client doesn't reconnect).
 * Platform-neutral: the app decides what a close means via `should_retry`.
 * @param {Object} store - MergeableStore
 * @param {Object} options
 * @param {string} options.url - ws(s):// sync endpoint
 * @param {Function} [options.on_status] - ( `connecting` | `synced` | `offline` | `stopped` ) => void
 * @param {Function} [options.should_retry] - async ( { code } ) => boolean; false stops for good
 * @param {Function} [options.create_socket] - url => WebSocket (tests)
 * @returns {{ stop: Function, retry_now: Function, drop: Function }}
 */
export const start_sync = ( store, { url, on_status = () => {}, should_retry = async () => true, create_socket = url => new WebSocket( url ) } ) => {

    let stopped = false
    let delay = MIN_DELAY
    let timer = null
    let synchronizer = null
    let socket = null

    // The single place that decides what happens after a socket ends (closed, failed or dropped)
    const ended = async ( current, code ) => {
        if( socket !== current ) return
        socket = null
        synchronizer?.destroy()
        synchronizer = null
        if( stopped ) return

        // Say so at once: the sign-in check below can take a while
        if( code !== REVOKED ) on_status( `offline` )
        const retry = code !== REVOKED && await should_retry( { code } )

        // The check is async: a newer connection (retry_now) or stop() may have happened meanwhile
        if( stopped || socket ) return
        if( !retry ) {
            stopped = true
            return on_status( `stopped`, { code } )
        }
        timer = setTimeout( connect, delay )
        delay = Math.min( delay * 2, MAX_DELAY )
    }

    // Hoisted: `ended` and `connect` call each other
    async function connect() {

        clearTimeout( timer )
        if( stopped || socket ) return

        // Known offline: wait for retry_now (the app calls it on `online`) instead of burning attempts
        if( globalThis.navigator?.onLine === false ) return on_status( `offline` )
        on_status( `connecting` )

        socket = create_socket( url )
        const current = socket

        current.addEventListener( `close`, ( { code } ) => ended( current, code ) )

        // Resolves once the socket opens; a failed open ends in `close` above
        await new Promise( resolve => {
            current.addEventListener( `open`, resolve, { once: true } )
            current.addEventListener( `close`, resolve, { once: true } )
        } )
        if( socket !== current || current.readyState !== 1 ) return

        // TinyBase reports timeouts and bad exchanges only here (startSync still resolves), so any of them
        // means this connection can't be trusted: close it and let `ended` reconnect
        let failed = false
        const on_error = error => {
            failed = true
            console.warn( `dolist sync:`, error?.message ?? error )
            if( socket === current ) current.close()
        }
        synchronizer = await createWsSynchronizer( store, current, REQUEST_TIMEOUT, undefined, undefined, on_error, FRAGMENT_SIZE )
        await synchronizer.startSync()
        if( socket !== current || failed ) return
        delay = MIN_DELAY
        on_status( `synced` )
    }

    connect().catch( () => socket?.close() )

    return {

        // Network gone: a half-open socket's close handshake can hang for minutes, so detach first, then close
        drop: () => {
            const current = socket
            if( !current ) return
            ended( current, 1006 )
            current.close()
        },

        // Network came back: skip the remaining backoff
        retry_now: () => {
            if( stopped || socket ) return
            delay = MIN_DELAY
            connect().catch( () => socket?.close() )
        },

        stop: () => {
            stopped = true
            clearTimeout( timer )
            socket?.close()
            synchronizer?.destroy()
        },
    }
}
