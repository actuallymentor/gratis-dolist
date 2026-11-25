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

    // Reads give up fast (sync state must not hang); writes like sign-in get longer: aborting one on a slow
    // network can burn a single-use code
    const response = await fetch( path, {
        method,
        signal: AbortSignal.timeout( method === `GET` ? 10_000 : 30_000 ),
        headers: body ? { 'Content-Type': `application/json` } : undefined,
        body: body ? JSON.stringify( body ) : undefined,
    } )
    // A body that fails to arrive on a 2xx is a failure too (enrollment's recovery codes live there)
    const json = await response.json().catch( error => {
        if( response.ok ) throw error
        return {}
    } )
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

// This tab's running connection, and whose account it syncs
let connection = null
let connected_user = null

/**
 * The account this device's local tasks belong to. Set by the first sync (tasks made before any sign-in
 * join that account); kept after sign-out. Another account never syncs into them (see `begin_sync`).
 */
const OWNER_KEY = `dolist:owner`
export const local_owner = () => {
    try {
        return localStorage.getItem( OWNER_KEY )
    } catch {
        return null
    }
}
const set_local_owner = user_id => {
    try {
        localStorage.setItem( OWNER_KEY, user_id )
    } catch { /* private mode: in-memory pin lost on reload, acceptable */ }
}

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
    connected_user = null
}

/**
 * Starts syncing if signed in. Safe to call repeatedly (after login, on boot).
 */
export const begin_sync = async () => {

    const account = await refresh_account()
    if( account && !account.signed_in ) return set_sync_status( `off` )

    // Signed in as someone else now (another tab switched accounts): drop the old account's socket
    if( connection && account && account.user_id !== connected_user ) end_sync()
    if( connection ) return

    // This device holds another account's tasks: never merge them in. Settings offers the switch.
    // Offline (account unknown): keep trying as the device's own account; the server decides once reachable
    const owner = local_owner()
    if( account && owner && owner !== account.user_id ) return set_sync_status( `other_account` )
    if( !account && !owner ) return
    if( !owner ) set_local_owner( account.user_id )
    connected_user = account?.user_id ?? owner

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

// Sign-in / sign-out in one tab: the others follow (they share the cookie, not the connection)
const account_channel = typeof BroadcastChannel === `undefined` ? null : new BroadcastChannel( `dolist:account` )
export const announce_account_change = () => account_channel?.postMessage( `changed` )
account_channel?.addEventListener( `message`, async () => {
    const account = await refresh_account()

    // Unknown (request failed) keeps whatever runs; only a definite sign-out stops sync
    if( !account || account.signed_in ) return begin_sync()
    end_sync()
    set_sync_status( `off` )
} )

/**
 * Hands this device to the signed-in account: deletes the previous account's tasks here (they stay in
 * that account), then syncs. Every tab follows through the tab channel.
 */
export const switch_device_account = async () => {
    const account = await refresh_account()
    if( !account?.signed_in ) return
    dolist.store.transaction( () => dolist.store.delTables() )
    await dolist.flush()
    set_local_owner( account.user_id )
    await begin_sync()
    announce_account_change()
}

// Back after a while hidden (laptop sleep, phone lock): the socket may be silently dead, so start fresh
const RESUME_AFTER = 60_000
let hidden_at = 0
document.addEventListener( `visibilitychange`, () => {
    if( document.hidden ) return hidden_at = Date.now()
    if( !connection || Date.now() - hidden_at < RESUME_AFTER ) return
    connection.drop()
    connection.retry_now()
} )

// Network gone: drop the socket (offline edits stay local); back: reconnect without waiting out the backoff
window.addEventListener( `offline`, () => connection?.drop() )
window.addEventListener( `online`, () => connection ? connection.retry_now() : begin_sync() )

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
