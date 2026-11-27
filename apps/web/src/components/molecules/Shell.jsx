import { useMemo, useState } from 'react'
import { NavLink } from 'react-router'
import styled from 'styled-components'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { use_labels, use_projects } from '@dolist/store/react'
import { use_app_store } from '../../stores/app'
import { project_tree, visible_tree } from '../../modules/selectors'
import { move_item } from '../../modules/sidebar'
import { format_combo } from '../../modules/keymap'
import { use_collapsed } from '../../hooks/use_collapsed'
import { NAV_ITEMS } from './nav_items'
import SidebarSettings from './SidebarSettings'

const Frame = styled.div`
    min-height: 100dvh;
    display: grid; grid-template-columns: 14rem minmax( 0, 1fr ); /* minmax: wide content (the board) scrolls itself, never the page */

    @media ( max-width: 720px ) { grid-template-columns: minmax( 0, 1fr ) }
`

const Nav = styled.nav`
    position: sticky; top: 0; height: 100dvh;
    display: flex; flex-direction: column; gap: .15rem;
    padding: 1.25rem .75rem; border-right: 1px solid var(--line-soft); overflow-y: auto;

    .brand { font: 600 1.1rem var(--font-head); padding: 0 .75rem 1rem; letter-spacing: .01em }

    a, .add, .plain {
        display: flex; align-items: center; gap: .65rem; min-height: 44px; padding: 0 .75rem;
        border-radius: var(--radius-sm); text-decoration: none; color: var(--muted);
        transition: background 160ms var(--ease), color 160ms var(--ease);
    }
    a:hover, .add:hover, .plain:hover { background: var(--sunk); color: var(--fg) }
    .plain { border: 0; background: none; font: inherit; cursor: pointer; text-align: left }
    .plain:focus-visible { box-shadow: 0 0 0 5px var(--accent-tint) }

    /* The one way to add (besides n): first in the list, accent so it reads as the action */
    .add { border: 0; background: none; font: inherit; cursor: pointer; color: var(--accent-strong); font-weight: 600; margin-bottom: .35rem }
    .add:focus-visible { box-shadow: 0 0 0 5px var(--accent-tint) }
    a.active { background: var(--accent-tint); color: var(--fg); font-weight: 600 }

    /* Project trees under Horizons and Projects; indent per level (--depth). A row = link + its fold chevron */
    .row { position: relative; display: flex; flex-direction: column }
    a.sub { min-height: 36px; font-size: .9rem; padding-left: calc( 2.6rem + var(--depth) * .9rem ) }
    a.sub span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap }
    .fold {
        position: absolute; top: 50%; translate: 0 -50%; display: grid; place-items: center; width: 28px; height: 28px; padding: 0;
        border: 0; border-radius: var(--radius-sm); background: none; color: var(--faint); cursor: pointer;
    }
    .fold:hover { background: var(--line-soft); color: var(--fg) }
    .fold:focus-visible { box-shadow: 0 0 0 4px var(--accent-tint) }
    .group > .fold { right: .35rem }
    .sub-row > .fold { left: calc( 1.1rem + var(--depth) * .9rem ) }
    .group > a { padding-right: 2.5rem }
    /* Items: draggable wrappers (an item + its tree). Drop marks a line above/below the target */
    .item { display: flex; flex-direction: column; gap: .15rem; border-radius: var(--radius-sm) }
    .item[data-dragging] { opacity: .4 }
    .item[data-drop="before"] { box-shadow: 0 -2px 0 var(--accent) }
    .item[data-drop="after"] { box-shadow: 0 2px 0 var(--accent) }
    .item.bottom { margin-top: auto }
    .item.bottom ~ .item.bottom { margin-top: 0 }

    /* Phone: bottom tab bar, thumb reach */
    @media ( max-width: 720px ) {
        position: fixed; inset: auto 0 0; top: auto; height: auto; z-index: 15;
        flex-direction: row; justify-content: space-around; gap: 0;
        padding: .25rem .5rem calc( .25rem + env(safe-area-inset-bottom) );
        border-right: 0; border-top: 1px solid var(--line-soft); background: var(--page);

        overflow: visible;
        .item { display: contents }
        .brand, .desktop-only { display: none }
        .add { margin: 0 }
        a, .add, .plain { flex: 1; flex-direction: column; justify-content: center; gap: .1rem; font-size: .72rem; border-radius: 0; position: relative }
        a.active { background: none }
        a.active::after { content: ""; position: absolute; inset: 0 25% auto; height: 3px; background: var(--accent); border-radius: 0 0 3px 3px }
        .bottom { margin-top: 0 }
        .group { flex: 1; flex-direction: row }
        .group > a { padding-right: .75rem }
    }
`

// Chevron that folds/unfolds a sidebar branch (desktop only; phones have no trees)
const Fold = ( { open, name, on_toggle } ) => <button type="button" className="fold desktop-only" onClick={ on_toggle }
    aria-expanded={ open } aria-label={ `${ open ? `Collapse` : `Expand` } ${ name }` }
>
    { open ? <ChevronDown size={ 16 } strokeWidth={ 1.75 } aria-hidden /> : <ChevronRight size={ 16 } strokeWidth={ 1.75 } aria-hidden /> }
</button>

const DRAG_TYPE = `application/x-dolist-nav`

// App frame: sidebar on desktop, bottom tabs on phones. Items, their order and visibility come from the
// per-device layout (Sidebar settings); rows drag to reorder on desktop.
// Every project sits under Projects (its tasks) and Horizons (its board); labels under Labels. Phones reach them via the pages
export default function Shell( { children } ) {

    const signed_in = use_app_store( state => !!state.account?.signed_in )
    const open_quick_add = use_app_store( state => state.set_quick_add_open )
    const open_settings = use_app_store( state => state.set_sidebar_settings_open )
    const layout = use_app_store( state => state.sidebar )
    const add_key = use_app_store( state => state.keymap.add )
    const set_sidebar = use_app_store( state => state.set_sidebar )
    const projects = use_projects()
    const labels = use_labels()
    const [ collapsed, toggle ] = use_collapsed()
    const [ dragging, set_dragging ] = useState( null )
    const [ drop, set_drop ] = useState( null )

    const trees = useMemo( () => ( {
        projects: project_tree( projects ),
        labels: labels.map( label => ( { ...label, depth: 0, path: label.name } ) ),
    } ), [ projects, labels ] )

    const keys = layout.order.filter( key => !layout.hidden.includes( key ) && !( NAV_ITEMS[ key ].signed_out_only && signed_in ) )

    // Pinned to the foot: the trailing run of bottom items (dragged up, an item joins the main list)
    let foot = keys.length
    while( foot > 0 && NAV_ITEMS[ keys[ foot - 1 ] ].bottom ) foot--
    const pinned = index => index >= foot

    // Native drag and drop between top-level items: drop above or below the target's middle
    const drag_props = key => ( {
        draggable: true,
        'data-dragging': dragging === key || undefined,
        'data-drop': drop?.key === key ? drop.after ? `after` : `before` : undefined,
        onDragStart: event => {
            event.dataTransfer.effectAllowed = `move`
            event.dataTransfer.setData( DRAG_TYPE, key )
            set_dragging( key )
        },
        onDragOver: event => {
            if( !dragging || dragging === key ) return
            event.preventDefault()
            const { top, height } = event.currentTarget.getBoundingClientRect()
            set_drop( { key, after: event.clientY > top + height / 2 } )
        },
        onDrop: event => {
            event.preventDefault()
            const moved = event.dataTransfer.getData( DRAG_TYPE ) || dragging
            if( moved && drop ) set_sidebar( { ...layout, order: move_item( layout.order, moved, drop.key, drop.after ) } )
            set_drop( null )
        },
        onDragEnd: () => {
            set_dragging( null )
            set_drop( null )
        },
    } )

    const render_item = ( key, index ) => {

        const { to, label, Icon, desktop_only, tree } = NAV_ITEMS[ key ]
        const className = [ `item`, desktop_only && `desktop-only`, pinned( index ) && `bottom` ].filter( Boolean ).join( ` ` )

        if( key === `add` ) return <div key={ key } className={ className } { ...drag_props( key ) }>
            <button type="button" className="add" onClick={ () => open_quick_add( true ) } aria-label="Add task"
                aria-keyshortcuts={ add_key || undefined } title={ add_key ? `Add task (${ format_combo( add_key ) })` : `Add task` }
            >
                <Icon size={ 20 } strokeWidth={ 1.75 } aria-hidden />
                <span>Add<span className="desktop-only"> task</span></span>
            </button>
        </div>

        if( key === `customize` ) return <div key={ key } className={ className } { ...drag_props( key ) }>
            <button type="button" className="plain" onClick={ () => open_settings( true ) }>
                <Icon size={ 20 } strokeWidth={ 1.5 } aria-hidden />
                <span>{ label }</span>
            </button>
        </div>

        const link = <NavLink to={ to } end={ !!tree }>
            <Icon size={ 20 } strokeWidth={ 1.5 } aria-hidden />
            <span>{ label }</span>
        </NavLink>
        if( !tree ) return <div key={ key } className={ className } { ...drag_props( key ) }>{ link }</div>

        // Fold keys: the whole group by its path, each branch by group + id (groups fold independently)
        const items = trees[ tree ]
        const open = !collapsed.has( to )
        const rows = open ? visible_tree( items, id => collapsed.has( `${ to }/${ id }` ) ) : []

        return <div key={ key } className={ className } { ...drag_props( key ) }>
            <div className="row group">
                { link }
                { !!items.length && <Fold open={ open } name={ `${ label } list` } on_toggle={ () => toggle( to ) } /> }
            </div>
            { rows.map( row => <div key={ row.id } className="row sub-row desktop-only" style={ { '--depth': row.depth } }>
                <NavLink to={ `${ to }/${ row.id }` } className="sub" aria-label={ `${ label }: ${ row.path }` } title={ row.path } draggable={ false }>
                    <span>{ tree === `labels` ? `@${ row.name }` : row.name }</span>
                </NavLink>
                { row.has_children && <Fold open={ !collapsed.has( `${ to }/${ row.id }` ) } name={ `${ label }: ${ row.path }` }
                    on_toggle={ () => toggle( `${ to }/${ row.id }` ) }
                /> }
            </div> ) }
        </div>
    }

    return <Frame>
        <Nav aria-label="Main">
            <span className="brand">Dolist</span>
            { keys.map( render_item ) }
        </Nav>
        <div>{ children }</div>
        <SidebarSettings />
    </Frame>
}
