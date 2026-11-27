import { useEffect } from 'react'
import { useNavigate } from 'react-router'
import { use_app_store } from '../stores/app'
import { action_for, combo_of, is_chord } from '../modules/keymap'

// Selection = keyboard focus on a card's title button, so Enter opens it natively and Tab/mouse stay in sync
const cards = () => [ ...document.querySelectorAll( `[data-task-id]` ) ].filter( card => !card.closest( `[role="dialog"]` ) && card.offsetParent )
const title_of = card => card?.querySelector( `.title` )
const focused_card = () => document.activeElement?.closest?.( `[data-task-id]` )

// Focus the card `step` away from the current one (j/k); nothing focused yet = first / last
const move = step => {
    const list = cards()
    if( !list.length ) return
    const index = list.indexOf( focused_card() )
    const next = index < 0 ? step > 0 ? 0 : list.length - 1 : Math.min( Math.max( index + step, 0 ), list.length - 1 )
    title_of( list[ next ] )?.focus()
    list[ next ].scrollIntoView( { block: `nearest` } )
}

// Complete the focused card via its own check (same Undo toast), then keep the selection on its neighbour
const complete = () => {
    const card = focused_card()
    if( !card ) return
    const list = cards()
    const index = list.indexOf( card )
    const neighbour = list[ index + 1 ] ?? list[ index - 1 ]
    card.querySelector( `button[aria-label^="Complete"]` )?.click()
    const id = neighbour?.dataset.taskId
    if( id ) requestAnimationFrame( () => title_of( document.querySelector( `[data-task-id="${ CSS.escape( id ) }"]` ) )?.focus() )
}

/**
 * Global shortcuts, rebindable in Settings (modules/keymap; defaults: n new task · / search · j/k next/previous · e complete).
 * Single keys are ignored while typing; chords (ctrl/alt/meta) work everywhere. Nothing fires while a dialog / menu is open.
 * Enter opens the focused card natively. Move (m) lives on Horizons, the cheatsheet (?) in Cheatsheet: same keymap.
 */
export const use_shortcuts = () => {

    const navigate = useNavigate()
    const open_quick_add = use_app_store( state => state.set_quick_add_open )
    const keymap = use_app_store( state => state.keymap )

    useEffect( () => {
        const on_key = event => {
            if( event.defaultPrevented ) return
            const combo = combo_of( event )
            const typing = /input|textarea|select/i.test( event.target.tagName ) || event.target.isContentEditable
            if( !combo || typing && !is_chord( combo ) ) return
            if( document.querySelector( `[role="dialog"], [role="menu"]` ) ) return

            const actions = {
                search: () => navigate( `/search` ),
                add: () => open_quick_add( true ),
                next: () => move( 1 ),
                previous: () => move( -1 ),
                complete,
            }
            const action = actions[ action_for( keymap, combo ) ]
            if( !action ) return
            event.preventDefault()
            action()
        }
        window.addEventListener( `keydown`, on_key )
        return () => window.removeEventListener( `keydown`, on_key )
    }, [ navigate, open_quick_add, keymap ] )
}
