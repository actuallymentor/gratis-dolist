// Rebindable keyboard shortcuts. A binding is a combo string: modifiers in a fixed order, then the key.
//   `n` · `/` · `?` · `shift+n` · `ctrl+k` · `ctrl+alt+arrowdown` · `meta+shift+f`
// Letters are stored lowercase (shift explicit); symbols keep the character the keyboard produced (`?`, not shift+/).
// Per device (localStorage): shortcuts follow the keyboard, not the account.

export const ACTIONS = [
    { id: `add`, label: `Add task`, fallback: `n` },
    { id: `search`, label: `Search`, fallback: `/` },
    { id: `next`, label: `Next task`, fallback: `j` },
    { id: `previous`, label: `Previous task`, fallback: `k` },
    { id: `complete`, label: `Complete selected task`, fallback: `e` },
    { id: `move`, label: `Move selected task (Horizons)`, fallback: `m` },
    { id: `cheatsheet`, label: `Cheatsheet`, fallback: `?` },
]

export const DEFAULT_KEYMAP = Object.fromEntries( ACTIONS.map( ( { id, fallback } ) => [ id, fallback ] ) )

const KEY = `dolist:keymap`
const MODIFIERS = [ `ctrl`, `alt`, `shift`, `meta` ]
const BARE = [ `Control`, `Alt`, `Shift`, `Meta`, `AltGraph`, `CapsLock`, `Dead`, `Unidentified` ]

// Keys that close / confirm / move focus stay fixed: rebinding them would trap people
export const RESERVED = [ `escape`, `enter`, `tab`, ` ` ]

/**
 * The combo a keydown means, or null for a lone modifier
 * @param {KeyboardEvent} event
 * @returns {string|null}
 */
export const combo_of = ( { key, ctrlKey, altKey, shiftKey, metaKey } ) => {
    if( !key || BARE.includes( key ) ) return null
    const char = key.length === 1
    const letter = char && /\p{L}/u.test( key )

    // Symbols already carry shift (`?`); letters and named keys say it out loud
    const shift = shiftKey && ( letter || !char )
    const held = { ctrl: ctrlKey, alt: altKey, shift, meta: metaKey }
    return [ ...MODIFIERS.filter( name => held[ name ] ), key.toLowerCase() ].join( `+` )
}

// True when a combo includes ctrl/alt/meta (those may fire while typing in a field)
export const is_chord = combo => /(?:^|\+)(?:ctrl|alt|meta)\+/.test( combo )

const LABELS = { ctrl: `Ctrl`, alt: `Alt`, shift: `Shift`, meta: `⌘`, arrowup: `↑`, arrowdown: `↓`, arrowleft: `←`, arrowright: `→`, ' ': `Space` }

// `ctrl+shift+k` → `Ctrl+Shift+K`
export const format_combo = combo => combo ? combo.split( /\+(?!$)/ ).map( part => LABELS[ part ] ?? ( part.length === 1 ? part.toUpperCase() : part[ 0 ].toUpperCase() + part.slice( 1 ) ) ).join( `+` ) : `—`

export const read_keymap = () => {
    try {
        return { ...DEFAULT_KEYMAP, ...JSON.parse( localStorage.getItem( KEY ) || `{}` ) }
    } catch {
        return { ...DEFAULT_KEYMAP }
    }
}

export const write_keymap = keymap => {
    try {
        localStorage.setItem( KEY, JSON.stringify( keymap ) )
    } catch { /* private mode: lasts for this session */ }
}

// The action bound to a combo, if any (null combos = lone modifiers, never an unbound action)
export const action_for = ( keymap, combo ) => combo ? Object.keys( keymap ).find( id => keymap[ id ] === combo ) : undefined
