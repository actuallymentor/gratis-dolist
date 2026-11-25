import { start_sync } from '@dolist/store'
import { dolist, set_clock_offset } from './dolist'
import { use_app_store } from '../stores/app'

/**
 * Sync across devices (plan §4.1). Every tab holds its own WebSocket: no leader election, so a frozen
 * background tab can never stall the one in use. BroadcastChannel still mirrors tabs instantly.
 */

const { set_account, set_sync_status } = use_app_store.getState()

/**
 * JSON call to our Worker. Throws with the server's message on non-2xx.
 * @param {string} path
 * @param {Object} [options] - { method, body }
 * @returns {Promise<Object>}
 */
export const api = async ( path, { method = `GET`, body } = {} ) => {
    const response = await fetch( path, {
        method,
        headers: body ? { 'Content-Type': `application/json` } : undefined,
        body: body ? JSON.stringify( body ) : undefined,
    } )
    const json = await response.json().catch( () => ( {} ) )
    if( !response.ok ) throw Object.assign( new Error( json.error || `Request failed (${ response.status })` ), { status: response.status } )
    return json
}

/**
 * Reads the session and corrects the store clock to server time (half the round trip as latency).
 * @returns {Promise<Object|null>} account, or null when offline
 */
export const refresh_account = async () => {
    try {
        const sent = Date.now()
        const account = await api( `/api/session` )
        const received = Date.now()
        set_clock_offset( account.now + ( received - sent ) / 2 - received )
        set_account( account )
        return account
    } catch {
        return null
    }
}

// This tab's running connection
let connection = null

const url = () => `${ location.protocol === `https:` ? `wss` : `ws` }://${ location.host }/sync`

// A close we can't explain: ask the server whether we're still signed in (offline = keep trying)
const should_retry = async () => {
    const account = await refresh_account()
    return !account || account.signed_in
}

const signed_out = () => {
    set_sync_status( `signed_out` )
    set_account( { ...use_app_store.getState().account, signed_in: false, session_id: null } )
}

/**
 * Stops syncing in this tab.
 */
export const end_sync = () => {
    connection?.stop()
    connection = null
}

/**
 * Starts syncing if signed in. Safe to call repeatedly (after login, on boot).
 */
export const begin_sync = async () => {

    const account = await refresh_account()
    if( account && !account.signed_in ) return set_sync_status( `off` )
    if( connection ) return

    connection = start_sync( dolist.store, {
        url: url(),
        should_retry,
        on_status: status => {
            if( status === `connecting` ) refresh_account()
            if( status !== `stopped` ) return set_sync_status( status )
            signed_out()
            end_sync()
        },
    } )
}

// Network gone: drop the socket (offline edits stay local); back: reconnect without waiting out the backoff
window.addEventListener( `offline`, () => connection?.drop() )
window.addEventListener( `online`, () => connection?.retry_now() )

/**
 * Short human name for this browser, shown in the devices list.
 * @returns {string}
 */
export const device_label = () => {
    const ua = navigator.userAgent
    const browser = /Edg\//.test( ua ) ? `Edge` : /Firefox\//.test( ua ) ? `Firefox` : /Chrome\//.test( ua ) ? `Chrome` : /Safari\//.test( ua ) ? `Safari` : `Browser`
    const os = /iPhone|iPad/.test( ua ) ? `iOS` : /Android/.test( ua ) ? `Android` : /Mac OS/.test( ua ) ? `macOS` : /Windows/.test( ua ) ? `Windows` : /Linux/.test( ua ) ? `Linux` : ``
    return os ? `${ browser } on ${ os }` : browser
}
