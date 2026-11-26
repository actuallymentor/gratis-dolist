import { Fragment, useMemo } from 'react'
import { NavLink } from 'react-router'
import styled from 'styled-components'
import { CalendarDays, CircleCheck, Columns3, FolderTree, Inbox, LogIn, Search, Settings } from 'lucide-react'
import { use_projects } from '@dolist/store/react'
import { use_app_store } from '../../stores/app'
import { project_tree } from '../../modules/selectors'

const NAV = [
    { to: `/inbox`, label: `Inbox`, Icon: Inbox },
    { to: `/today`, label: `Today`, Icon: CalendarDays },
    { to: `/horizons`, label: `Horizons`, Icon: Columns3, tree: true },
    { to: `/projects`, label: `Projects`, Icon: FolderTree, tree: true },
    { to: `/search`, label: `Search`, Icon: Search },
    { to: `/completed`, label: `Completed`, Icon: CircleCheck, desktop_only: true },
    { to: `/signin`, label: `Sign in`, Icon: LogIn, desktop_only: true, signed_out_only: true, bottom: true },
    { to: `/settings`, label: `Settings`, Icon: Settings, bottom: true },
]

const Frame = styled.div`
    min-height: 100dvh;
    display: grid; grid-template-columns: 14rem 1fr;

    @media ( max-width: 720px ) { grid-template-columns: 1fr }
`

const Nav = styled.nav`
    position: sticky; top: 0; height: 100dvh;
    display: flex; flex-direction: column; gap: .15rem;
    padding: 1.25rem .75rem; border-right: 1px solid var(--line-soft); overflow-y: auto;

    .brand { font: 600 1.1rem var(--font-head); padding: 0 .75rem 1rem; letter-spacing: .01em }

    a {
        display: flex; align-items: center; gap: .65rem; min-height: 44px; padding: 0 .75rem;
        border-radius: var(--radius-sm); text-decoration: none; color: var(--muted);
        transition: background 160ms var(--ease), color 160ms var(--ease);
    }
    a:hover { background: var(--sunk); color: var(--fg) }
    a.active { background: var(--accent-tint); color: var(--fg); font-weight: 600 }

    /* Project trees under Horizons and Projects; indent per level (--depth) */
    a.sub { min-height: 36px; font-size: .9rem; padding-left: calc( 2.6rem + var(--depth) * .9rem ) }
    a.sub span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap }
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
        a { flex: 1; flex-direction: column; justify-content: center; gap: .1rem; font-size: .72rem; border-radius: 0; position: relative }
        a.active { background: none }
        a.active::after { content: ""; position: absolute; inset: 0 25% auto; height: 3px; background: var(--accent); border-radius: 0 0 3px 3px }
        .bottom { margin-top: 0 }
    }
`

// App frame: sidebar on desktop, bottom tabs on phones
// Signed out, the sidebar offers Sign in (phones reach it through Settings)
// Every project sits under Projects (its tasks) and under Horizons (its board); phones reach both via the Projects tab
export default function Shell( { children } ) {

    const signed_in = use_app_store( state => !!state.account?.signed_in )
    const projects = use_projects()
    const tree = useMemo( () => project_tree( projects ), [ projects ] )
    const items = NAV.filter( item => !item.signed_out_only || !signed_in )

    return <Frame>
        <Nav aria-label="Main">
            <span className="brand">Dolist</span>
            { items.map( ( { to, label, Icon, desktop_only, bottom, tree: nested } ) => <Fragment key={ to }>
                <NavLink to={ to } end={ nested } className={ [ desktop_only && `desktop-only`, bottom && `bottom` ].filter( Boolean ).join( ` ` ) || undefined }>
                    <Icon size={ 20 } strokeWidth={ 1.5 } aria-hidden />
                    <span>{ label }</span>
                </NavLink>
                { nested && tree.map( project => <NavLink key={ project.id } to={ `${ to }/${ project.id }` } className="sub desktop-only"
                    style={ { '--depth': project.depth } } aria-label={ `${ label }: ${ project.path }` } title={ project.path }
                >
                    <span>{ project.name }</span>
                </NavLink> ) }
            </Fragment> ) }
        </Nav>
        <div>{ children }</div>
    </Frame>
}
