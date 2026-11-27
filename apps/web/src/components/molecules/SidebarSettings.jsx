import { useEffect } from 'react'
import styled from 'styled-components'
import { ArrowDown, ArrowUp } from 'lucide-react'
import Modal from '../atoms/Modal'
import { use_app_store } from '../../stores/app'
import { normalize_layout } from '../../modules/sidebar'
import { NAV_ITEMS } from './nav_items'

const Body = styled.div`
    padding: 1.25rem 1.5rem 1.5rem;

    h2 { font-size: 1.1rem; margin-bottom: .25rem }
    p { color: var(--muted); font-size: .88rem; margin-bottom: 1rem }
    ol { list-style: none; padding: 0; margin: 0; display: grid; gap: .25rem }
    li { display: flex; align-items: center; gap: .5rem; min-height: 44px; padding: 0 .25rem 0 .75rem; border: 1px solid var(--line-soft); border-radius: var(--radius-sm); background: var(--page) }
    label { flex: 1; display: flex; align-items: center; gap: .6rem; min-height: 44px; cursor: pointer }
    label small { color: var(--faint); font-size: .8rem }
    input { width: 1.05rem; height: 1.05rem; accent-color: var(--accent-strong) }
    li button { display: grid; place-items: center; width: 36px; height: 36px; border: 0; border-radius: var(--radius-sm); background: none; color: var(--muted); cursor: pointer }
    li button:hover:not(:disabled) { background: var(--sunk); color: var(--fg) }
    li button:disabled { opacity: .3; cursor: default }
    .actions { display: flex; justify-content: space-between; gap: .5rem; margin-top: 1rem }
    .actions button { min-height: 44px; padding: 0 1rem; border-radius: 999px; cursor: pointer; border: 1px solid var(--line); background: var(--page); color: var(--fg); font: inherit }
    .actions .done { background: var(--accent-strong); border-color: transparent; color: var(--page) }
`

/**
 * Sidebar settings: tick what shows, reorder with the arrows (or drag rows in the sidebar itself).
 * Settings can't be hidden: it's the way back here (Settings → Sidebar), on phones too.
 */
export default function SidebarSettings() {

    const open = use_app_store( state => state.sidebar_settings_open )
    const set_open = use_app_store( state => state.set_sidebar_settings_open )
    const { order, hidden } = use_app_store( state => state.sidebar )
    const set_sidebar = use_app_store( state => state.set_sidebar )

    useEffect( () => {
        if( !open ) return
        const on_key = event => event.key === `Escape` && set_open( false )
        window.addEventListener( `keydown`, on_key )
        return () => window.removeEventListener( `keydown`, on_key )
    }, [ open, set_open ] )

    if( !open ) return null

    const toggle = key => set_sidebar( { order, hidden: hidden.includes( key ) ? hidden.filter( item => item !== key ) : [ ...hidden, key ] } )
    const shift = ( index, step ) => {
        const next = [ ...order ]
        ;[ next[ index ], next[ index + step ] ] = [ next[ index + step ], next[ index ] ]
        set_sidebar( { order: next, hidden } )
    }

    return <Modal label="Sidebar settings" on_close={ () => set_open( false ) } width="26rem">
        <Body>
            <h2>Sidebar</h2>
            <p>Choose what shows and in which order.</p>
            <ol>
                { order.map( ( key, index ) => {
                    const { label, Icon, desktop_only, pinned } = NAV_ITEMS[ key ]
                    return <li key={ key }>
                        <label>
                            <input type="checkbox" checked={ pinned || !hidden.includes( key ) } disabled={ pinned } onChange={ () => toggle( key ) } />
                            <Icon size={ 18 } strokeWidth={ 1.5 } aria-hidden />
                            <span>{ label } { desktop_only && <small>desktop</small> }{ pinned && <small>always shown</small> }</span>
                        </label>
                        <button type="button" onClick={ () => shift( index, -1 ) } disabled={ index === 0 } aria-label={ `Move ${ label } up` }><ArrowUp size={ 16 } strokeWidth={ 1.75 } aria-hidden /></button>
                        <button type="button" onClick={ () => shift( index, 1 ) } disabled={ index === order.length - 1 } aria-label={ `Move ${ label } down` }><ArrowDown size={ 16 } strokeWidth={ 1.75 } aria-hidden /></button>
                    </li>
                } ) }
            </ol>
            <div className="actions">
                <button type="button" onClick={ () => set_sidebar( normalize_layout() ) }>Reset</button>
                <button type="button" className="done" onClick={ () => set_open( false ) } autoFocus>Done</button>
            </div>
        </Body>
    </Modal>
}
