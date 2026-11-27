// Sidebar layout per device: item order + hidden items (localStorage). Unknown keys drop out, new items append,
// so a stored layout survives items being added or removed between versions.

export const SIDEBAR_ITEMS = [ `add`, `triage`, `horizons`, `projects`, `labels`, `search`, `completed`, `signin`, `settings`, `customize` ]

const KEY = `dolist:sidebar`

/**
 * A stored layout cleaned against the current items
 * @param {{ order?: string[], hidden?: string[] }} [layout]
 * @returns {{ order: string[], hidden: string[] }}
 */
export const normalize_layout = ( { order = [], hidden = [] } = {} ) => {
    const known = order.filter( ( key, index ) => SIDEBAR_ITEMS.includes( key ) && order.indexOf( key ) === index )
    return {
        order: [ ...known, ...SIDEBAR_ITEMS.filter( key => !known.includes( key ) ) ],
        hidden: hidden.filter( key => SIDEBAR_ITEMS.includes( key ) && key !== `settings` ), // Settings is the way back: never hidden
    }
}

export const read_layout = () => {
    try {
        return normalize_layout( JSON.parse( localStorage.getItem( KEY ) || `{}` ) )
    } catch {
        return normalize_layout()
    }
}

export const write_layout = layout => {
    try {
        localStorage.setItem( KEY, JSON.stringify( layout ) )
    } catch { /* private mode: lasts for this session */ }
}

/**
 * Moves `key` to where `target` is (before it, or after when `after`)
 * @param {string[]} order
 * @param {string} key
 * @param {string} target
 * @param {boolean} [after]
 * @returns {string[]}
 */
export const move_item = ( order, key, target, after = false ) => {
    if( key === target ) return order
    const rest = order.filter( item => item !== key )
    const index = rest.indexOf( target ) + ( after ? 1 : 0 )
    return [ ...rest.slice( 0, index ), key, ...rest.slice( index ) ]
}
