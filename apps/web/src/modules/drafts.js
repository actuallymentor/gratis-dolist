/**
 * Per-tab drafts that survive reloads and crashes.
 * Each tab has an id (sessionStorage, so it survives that tab's reloads) and holds a Web Lock named after it while alive.
 * Drafts live in localStorage under `dolist:draft:<name>:<tab>`. A new tab with no draft of its own
 * adopts one left by a dead tab (its lock is free), so closing a tab never loses typed text.
 */
const PREFIX = `dolist:draft:`
const LOCK_PREFIX = `dolist:tab:`

const safe = fn => {
    try {
        return fn()
    } catch {
        return null
    }
}

const tab_id = safe( () => {
    const existing = sessionStorage.getItem( `dolist:tab` )
    if( existing ) return existing
    const fresh = crypto.randomUUID()
    sessionStorage.setItem( `dolist:tab`, fresh )
    return fresh
} ) || crypto.randomUUID()

// Hold this tab's liveness lock until the tab dies
navigator.locks?.request( `${ LOCK_PREFIX }${ tab_id }`, () => new Promise( () => {} ) )

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

    if( read_draft( name ) || !navigator.locks ) return ``

    const { held = [] } = await navigator.locks.query()
    const alive = new Set( held.map( ( { name: lock } ) => lock ) )
    const orphan_keys = safe( () => Object.keys( localStorage ) )?.filter( key => {
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
