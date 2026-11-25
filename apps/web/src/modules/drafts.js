/**
 * Per-tab drafts that survive reloads and crashes.
 * Each tab has an id (sessionStorage, so it survives that tab's reloads) and holds a Web Lock named after it while alive.
 * Drafts live in localStorage under `dolist:draft:<name>:<tab>`. A new tab with no draft of its own
 * adopts one left by a dead tab (its lock is free), so closing a tab never loses typed text.
 * A duplicated tab inherits sessionStorage (same id); it finds the lock taken and switches to a fresh id.
 */
const PREFIX = `dolist:draft:`
const LOCK_PREFIX = `dolist:tab:`
const TAB_KEY = `dolist:tab`

const safe = fn => {
    try {
        return fn()
    } catch {
        return null
    }
}

const fresh_id = () => {
    const id = crypto.randomUUID()
    safe( () => sessionStorage.setItem( TAB_KEY, id ) )
    return id
}

let tab_id = safe( () => sessionStorage.getItem( TAB_KEY ) ) || fresh_id()

// Hold this tab's liveness lock until the tab dies. Resolves once the id is final.
const hold = ( id, options = {} ) => new Promise( resolve => navigator.locks.request( `${ LOCK_PREFIX }${ id }`, options, lock => {
    resolve( !!lock )
    return lock && new Promise( () => {} )
} ) )

// A reload can race the previous page releasing the lock, so retry once before concluding it's a duplicate
const try_hold = () => hold( tab_id, { ifAvailable: true } )
const tab_ready = navigator.locks ? try_hold()
    .then( held => held || new Promise( resolve => setTimeout( resolve, 300 ) ).then( try_hold ) )
    .then( held => {
        if( held ) return
        tab_id = fresh_id()
        return hold( tab_id )
    } ) : Promise.resolve()

const key_of = ( name, tab = tab_id ) => `${ PREFIX }${ name }:${ tab }`

export const read_draft = name => safe( () => localStorage.getItem( key_of( name ) ) ) || ``

export const write_draft = ( name, text ) => safe( () => {
    if( text ) localStorage.setItem( key_of( name ), text )
    else localStorage.removeItem( key_of( name ) )
} )

/**
 * Take over a dead tab's draft for `name`, if this tab has none. Resolves with the adopted text or ``.
 */
export const adopt_orphan_draft = async name => {

    await tab_ready
    if( read_draft( name ) || !navigator.locks ) return ``

    const { held = [] } = await navigator.locks.query()
    const alive = new Set( held.map( ( { name: lock } ) => lock ) )
    const orphan_keys = safe( () => Object.keys( localStorage ) )?.filter( key => {

        // Drafts saved before per-tab keys belong to nobody
        if( key === `${ PREFIX }${ name }` ) return true
        if( !key.startsWith( `${ PREFIX }${ name }:` ) ) return false
        const tab = key.slice( `${ PREFIX }${ name }:`.length )
        return tab !== tab_id && !alive.has( `${ LOCK_PREFIX }${ tab }` )
    } ) || []

    const [ key ] = orphan_keys
    if( !key ) return ``
    const text = safe( () => localStorage.getItem( key ) ) || ``
    safe( () => localStorage.removeItem( key ) )
    write_draft( name, text )
    return text
}
