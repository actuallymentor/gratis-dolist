import { Fragment, useMemo } from 'react'
import { NavLink } from 'react-router'
import styled from 'styled-components'
import { ChevronDown, ChevronRight, CircleCheck, Columns3, FolderTree, ListFilter, LogIn, Plus, Search, Settings } from 'lucide-react'
import { use_projects } from '@dolist/store/react'
import { use_app_store } from '../../stores/app'
import { project_tree, visible_tree } from '../../modules/selectors'
import { use_collapsed } from '../../hooks/use_collapsed'

const NAV = [
    { to: `/triage`, label: `Triage`, Icon: ListFilter },
    { to: `/horizons`, label: `Horizons`, Icon: Columns3, tree: true },
    { to: `/projects`, label: `Projects`, Icon: FolderTree, tree: true },
    { to: `/search`, label: `Search`, Icon: Search },
    { to: `/completed`, label: `Completed`, Icon: CircleCheck, desktop_only: true },
    { to: `/signin`, label: `Sign in`, Icon: LogIn, desktop_only: true, signed_out_only: true, bottom: true },
    { to: `/settings`, label: `Settings`, Icon: Settings, bottom: true },
]

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

    a, .add {
        display: flex; align-items: center; gap: .65rem; min-height: 44px; padding: 0 .75rem;
        border-radius: var(--radius-sm); text-decoration: none; color: var(--muted);
        transition: background 160ms var(--ease), color 160ms var(--ease);
    }
    a:hover, .add:hover { background: var(--sunk); color: var(--fg) }

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
    .bottom ~ .bottom { margin-top: 0 }
    .bottom { margin-top: auto }

    /* Phone: bottom tab bar, thumb reach */
    @media ( max-width: 720px ) {
        position: fixed; inset: auto 0 0; top: auto; height: auto; z-index: 15;
        flex-direction: row; justify-content: space-around; gap: 0;
        padding: .25rem .5rem calc( .25rem + env(safe-area-inset-bottom) );
        border-right: 0; border-top: 1px solid var(--line-soft); background: var(--page);

        overflow: visible;
        .brand, .desktop-only { display: none }
        .add { margin: 0 }
        a, .add { flex: 1; flex-direction: column; justify-content: center; gap: .1rem; font-size: .72rem; border-radius: 0; position: relative }
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

// App frame: sidebar on desktop, bottom tabs on phones
// Signed out, the sidebar offers Sign in (phones reach it through Settings)
// Every project sits under Projects (its tasks) and under Horizons (its board); phones reach both via the Projects tab
export default function Shell( { children } ) {

    const signed_in = use_app_store( state => !!state.account?.signed_in )
    const open_quick_add = use_app_store( state => state.set_quick_add_open )
    const projects = use_projects()
    const tree = useMemo( () => project_tree( projects ), [ projects ] )
    const [ collapsed, toggle ] = use_collapsed()
    const items = NAV.filter( item => !item.signed_out_only || !signed_in )

    return <Frame>
        <Nav aria-label="Main">
            <span className="brand">Dolist</span>
            <button type="button" className="add" onClick={ () => open_quick_add( true ) } aria-label="Add task" aria-keyshortcuts="n" title="Add task (n)">
                <Plus size={ 20 } strokeWidth={ 1.75 } aria-hidden />
                <span>Add<span className="desktop-only"> task</span></span>
            </button>
            { items.map( ( { to, label, Icon, desktop_only, bottom, tree: nested } ) => {

                const link = <NavLink to={ to } end={ nested } className={ [ desktop_only && `desktop-only`, bottom && `bottom` ].filter( Boolean ).join( ` ` ) || undefined }>
                    <Icon size={ 20 } strokeWidth={ 1.5 } aria-hidden />
                    <span>{ label }</span>
                </NavLink>
                if( !nested ) return <Fragment key={ to }>{ link }</Fragment>

                // Fold keys: the whole group by its path, each project by group + id (Horizons and Projects fold independently)
                const open = !collapsed.has( to )
                const rows = open ? visible_tree( tree, id => collapsed.has( `${ to }/${ id }` ) ) : []

                return <Fragment key={ to }>
                    <div className="row group">
                        { link }
                        { !!tree.length && <Fold open={ open } name={ `${ label } list` } on_toggle={ () => toggle( to ) } /> }
                    </div>
                    { rows.map( project => <div key={ project.id } className="row sub-row desktop-only" style={ { '--depth': project.depth } }>
                        <NavLink to={ `${ to }/${ project.id }` } className="sub" aria-label={ `${ label }: ${ project.path }` } title={ project.path }>
                            <span>{ project.name }</span>
                        </NavLink>
                        { project.has_children && <Fold open={ !collapsed.has( `${ to }/${ project.id }` ) } name={ `${ label }: ${ project.path }` }
                            on_toggle={ () => toggle( `${ to }/${ project.id }` ) }
                        /> }
                    </div> ) }
                </Fragment>
            } ) }
        </Nav>
        <div>{ children }</div>
    </Frame>
}
