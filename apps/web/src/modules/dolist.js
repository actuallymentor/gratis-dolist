import { create_dolist_store } from '@dolist/store'

// Server time minus device time (ms), from /api/session. Keeps HLC stamps honest on devices with a wrong clock.
// Remembered, so an offline start still stamps in server time; recalibrated on every (re)connect
const OFFSET_KEY = `dolist:clock-offset`
let clock_offset = ( () => {
    try {
        return Number( localStorage.getItem( OFFSET_KEY ) ) || 0
    } catch {
        return 0
    }
} )()
export const set_clock_offset = offset => {
    clock_offset = offset
    try {
        localStorage.setItem( OFFSET_KEY, String( Math.round( offset ) ) )
    } catch { /* private mode: in-memory only */ }
}

/**
 * The tab's one local store. `flush()` resolves when queued writes are committed to IndexedDB:
 * every user-visible acknowledgement (toast, cleared draft) waits for it, so "acked" means "on disk".
 */
export const dolist = create_dolist_store( { get_now: () => Date.now() + clock_offset } )
export const flush = () => dolist.flush()
