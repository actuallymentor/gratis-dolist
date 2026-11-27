import { useCallback, useState } from 'react'

// Which sidebar branches are folded: a per-device convenience, so localStorage (and fine when it's unavailable)
const KEY = `dolist:sidebar-collapsed`

const read = () => {
    try {
        return new Set( JSON.parse( localStorage.getItem( KEY ) || `[]` ) )
    } catch {
        return new Set()
    }
}

/**
 * Folded branch keys, remembered on this device
 * @returns {[ Set<string>, ( key: string ) => void ]} collapsed keys, toggle
 */
export const use_collapsed = () => {

    const [ collapsed, set_collapsed ] = useState( read )

    const toggle = useCallback( key => set_collapsed( current => {
        const next = new Set( current )
        if( next.has( key ) ) next.delete( key )
        else next.add( key )
        try {
            localStorage.setItem( KEY, JSON.stringify( [ ...next ] ) )
        } catch { /* private mode: folds just don't persist */ }
        return next
    } ), [] )

    return [ collapsed, toggle ]
}
