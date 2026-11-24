import { NavLink } from 'react-router'
import styled from 'styled-components'
import { CalendarDays, Columns3, Inbox, Settings } from 'lucide-react'

const NAV = [
    { to: `/inbox`, label: `Inbox`, Icon: Inbox },
    { to: `/today`, label: `Today`, Icon: CalendarDays },
    { to: `/horizons`, label: `Horizons`, Icon: Columns3 },
    { to: `/settings`, label: `Settings`, Icon: Settings },
]

const Frame = styled.div`
    min-height: 100dvh;
    display: grid; grid-template-columns: 14rem 1fr;

    @media ( max-width: 720px ) { grid-template-columns: 1fr }
`

const Nav = styled.nav`
    position: sticky; top: 0; height: 100dvh;
    display: flex; flex-direction: column; gap: .15rem;
    padding: 1.25rem .75rem; border-right: 1px solid var(--line-soft);

    .brand { font: 600 1.1rem var(--font-head); padding: 0 .75rem 1rem; letter-spacing: .01em }

    a {
        display: flex; align-items: center; gap: .65rem; min-height: 44px; padding: 0 .75rem;
        border-radius: var(--radius-sm); text-decoration: none; color: var(--muted);
        transition: background 160ms var(--ease), color 160ms var(--ease);
    }
    a:hover { background: var(--sunk); color: var(--fg) }
    a.active { background: var(--accent-tint); color: var(--fg); font-weight: 600 }
    a:last-child { margin-top: auto }

    /* Phone: bottom tab bar, thumb reach */
    @media ( max-width: 720px ) {
        position: fixed; inset: auto 0 0; top: auto; height: auto; z-index: 15;
        flex-direction: row; justify-content: space-around; gap: 0;
        padding: .25rem .5rem calc( .25rem + env(safe-area-inset-bottom) );
        border-right: 0; border-top: 1px solid var(--line-soft); background: var(--page);

        .brand { display: none }
        a { flex: 1; flex-direction: column; justify-content: center; gap: .1rem; font-size: .72rem; border-radius: 0; position: relative }
        a.active { background: none }
        a.active::after { content: ""; position: absolute; inset: 0 25% auto; height: 3px; background: var(--accent); border-radius: 0 0 3px 3px }
        a:last-child { margin-top: 0 }
    }
`

// App frame: sidebar on desktop, bottom tabs on phones
export default function Shell( { children } ) {
    return <Frame>
        <Nav aria-label="Main">
            <span className="brand">Dolist</span>
            { NAV.map( ( { to, label, Icon } ) => <NavLink key={ to } to={ to }>
                <Icon size={ 20 } strokeWidth={ 1.5 } aria-hidden />
                <span>{ label }</span>
            </NavLink> ) }
        </Nav>
        <div>{ children }</div>
    </Frame>
}
