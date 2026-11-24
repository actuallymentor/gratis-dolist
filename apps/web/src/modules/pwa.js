import { registerSW } from 'virtual:pwa-register'
import { log } from 'mentie'
import { use_app_store } from '../stores/app'

const HOUR_MS = 60 * 60 * 1_000

let update_sw = null

/**
 * Register the service worker and keep every open instance current.
 * A waiting update activates immediately (all tabs reload) unless someone holds unsent input;
 * then the persistent "Update ready" badge appears and the user picks the moment.
 */
export const register_pwa = () => {

    const { set_update_ready } = use_app_store.getState()

    update_sw = registerSW( {
        onNeedRefresh() {
            const { unsaved } = use_app_store.getState()
            if( !unsaved.size ) {
                log.info( `New version available, activating` )
                return update_sw( true )
            }
            log.info( `New version waiting on unsaved input` )
            set_update_ready( true )
        },
        onRegisteredSW( _url, registration ) {

            // Long-lived tabs (installed PWA) check hourly instead of only on navigation
            if( registration ) setInterval( () => registration.update(), HOUR_MS )
        },
        onRegisterError( error ) {
            log.warn( `Service worker registration failed`, error )
        },
    } )

    // Another tab activated the new worker: follow it, unless this tab has unsent input
    navigator.serviceWorker?.addEventListener( `controllerchange`, () => {
        const { unsaved } = use_app_store.getState()
        if( !unsaved.size ) window.location.reload()
    } )

    return update_sw
}

// The "Update ready" badge: activate the waiting worker, which reloads every open tab
export const activate_update = () => update_sw ? update_sw( true ) : window.location.reload()

/**
 * Settings → "Update app": the escape hatch. Drop every worker + cache, then reload fresh.
 */
export const hard_update = async () => {
    const registrations = await navigator.serviceWorker?.getRegistrations() || []
    await Promise.all( registrations.map( registration => registration.unregister() ) )
    const cache_keys = await caches?.keys() || []
    await Promise.all( cache_keys.map( key => caches.delete( key ) ) )
    window.location.reload()
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
