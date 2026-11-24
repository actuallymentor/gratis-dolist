import { registerSW } from 'virtual:pwa-register'
import { log } from 'mentie'
import { use_app_store } from '../stores/app'
import { any_tab_unsaved } from './unsaved'

const HOUR_MS = 60 * 60 * 1_000

let update_sw = null
let sw_registration = null

// Set when the user clicks the badge: from then on, reloading this tab is their call, not ours
let user_confirmed = false

/**
 * Register the service worker and keep every open instance current.
 * A waiting update activates at once (all tabs reload) unless ANY tab holds unsent input;
 * then the persistent "Update ready" badge appears and the user picks the moment.
 * Every reload goes through on_need_reload, so a dirty tab is never reloaded under its user.
 */
export const register_pwa = () => {

    const { set_update_ready } = use_app_store.getState()

    update_sw = registerSW( {

        async onNeedRefresh() {
            if( await any_tab_unsaved() ) {
                log.info( `New version waiting on unsaved input` )
                return set_update_ready( true )
            }
            log.info( `New version available, activating` )
            update_sw( true )
        },

        // The new worker took control (from this tab or another): reload only if this tab is clean
        onNeedReload() {
            const { unsaved } = use_app_store.getState()
            if( unsaved.size && !user_confirmed ) return set_update_ready( true )
            window.location.reload()
        },

        onRegisteredSW( _url, registration ) {

            sw_registration = registration

            // Long-lived tabs (installed PWA) check hourly instead of only on navigation
            if( registration ) setInterval( () => registration.update(), HOUR_MS )
        },

        onRegisterError( error ) {
            log.warn( `Service worker registration failed`, error )
        },

    } )

    return update_sw
}

// The "Update ready" badge: the user chose the moment. Activate the waiting worker
// (its takeover reloads every clean tab), or just reload if another tab already activated it.
export const activate_update = () => {
    user_confirmed = true
    if( sw_registration?.waiting ) return update_sw( true )
    window.location.reload()
}

/**
 * Settings → "Update app": the escape hatch. Only when the new shell is reachable,
 * so pressing it offline never throws away the working cached app.
 * @returns {Promise<boolean>} false when offline / unreachable (nothing was touched)
 */
export const hard_update = async () => {

    const reachable = await fetch( `/index.html?probe=${ Date.now() }`, { cache: `no-store` } ).then( res => res.ok ).catch( () => false )
    if( !reachable ) return false

    const registrations = await navigator.serviceWorker?.getRegistrations() || []
    await Promise.all( registrations.map( registration => registration.unregister() ) )
    const cache_keys = await caches?.keys() || []
    await Promise.all( cache_keys.map( key => caches.delete( key ) ) )
    window.location.reload()
    return true

}

/**
 * Capture the browser's install prompt so the Install pill can trigger it later
 */
export const listen_for_install = () => {
    window.addEventListener( `beforeinstallprompt`, event => {
        event.preventDefault()
        use_app_store.getState().set_install_prompt( event )
    } )
    window.addEventListener( `appinstalled`, () => use_app_store.getState().set_install_prompt( null ) )
}

export const is_standalone = () => window.matchMedia?.( `(display-mode: standalone)` ).matches || window.navigator.standalone === true
