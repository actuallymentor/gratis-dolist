import { useEffect } from 'react'
import { useNavigate } from 'react-router'
import { use_app_store } from '../stores/app'

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
 * Global single-key shortcuts; ignored while typing in a field or while a dialog is open.
 *   n new task (modal) · / search · j/k next/previous task · e complete · Enter open (native on the focused title)
 */
export const use_shortcuts = () => {

    const navigate = useNavigate()
    const open_quick_add = use_app_store( state => state.set_quick_add_open )

    useEffect( () => {
        const on_key = event => {
            if( event.metaKey || event.ctrlKey || event.altKey || event.defaultPrevented ) return
            if( /input|textarea|select/i.test( event.target.tagName ) || event.target.isContentEditable ) return
            if( document.querySelector( `[role="dialog"]` ) ) return

            const actions = {
                '/': () => navigate( `/search` ),
                n: () => open_quick_add( true ),
                j: () => move( 1 ),
                k: () => move( -1 ),
                e: complete,
            }
            const action = actions[ event.key ]
            if( !action ) return
            event.preventDefault()
            action()
        }
        window.addEventListener( `keydown`, on_key )
        return () => window.removeEventListener( `keydown`, on_key )
    }, [ navigate, open_quick_add ] )
}
