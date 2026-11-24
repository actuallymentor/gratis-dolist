/**
 * Cross-tab "someone holds unsent input" signal, via a shared Web Lock.
 * Each dirty tab holds the lock; it frees itself when the tab clears or closes (even on crash).
 * Any tab can ask whether *any* tab is dirty before activating an update for all of them.
 */
const LOCK = `dolist:unsaved`

let wanted = false
let release = null

export const hold_unsaved = dirty => {

    wanted = dirty

    if( dirty && !release ) navigator.locks?.request( LOCK, { mode: `shared` }, () => new Promise( resolve => {

        // Went clean before the lock was granted: let go right away
        if( !wanted ) return resolve()
        release = resolve

    } ) )

    if( !dirty && release ) {
        release()
        release = null
    }

}

export const any_tab_unsaved = async () => {
    const { held = [], pending = [] } = await navigator.locks?.query() || {}
    return [ ...held, ...pending ].some( ( { name } ) => name === LOCK )
}
