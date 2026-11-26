import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import styled from 'styled-components'
import { CalendarDays, Columns3, LogIn, RefreshCw } from 'lucide-react'
import { use_app_store } from '../../stores/app'
import { local_owner } from '../../modules/sync'

// Routes that must never be covered: the sign-in page itself (email links land there) and fast capture
const EXEMPT = [ `/signin`, `/capture` ]

// Test-only escape hatch: e2e contexts set it so the screen doesn't cover every fresh page
const skipped = ( () => {
    try {
        return localStorage.getItem( `dolist:skip-welcome` ) === `1`
    } catch {
        return false
    }
} )()

const Screen = styled.div`
    position: fixed; inset: 0; z-index: 60; overflow-y: auto;
    display: grid; place-items: center; padding: 1.5rem 1rem calc( 1.5rem + env(safe-area-inset-bottom) );
    background: var(--page);
    animation: fade 240ms var(--ease);

    @keyframes fade { from { opacity: 0 } }

    > div { width: min( 24rem, 100% ); display: grid; gap: 1.75rem; outline: none }

    .brand { display: flex; align-items: center; gap: .7rem; font: 600 1.4rem var(--font-head) }
    .brand img { width: 40px; height: 40px }
    h1 { font: 500 1.75rem/1.25 var(--font-head) }
    .lede { color: var(--muted); margin-top: .5rem }

    ul { list-style: none; display: grid; gap: .7rem; padding: 0; margin: 0 }
    li { display: flex; gap: .65rem; align-items: center; color: var(--fg); font-size: .95rem }
    li svg { color: var(--accent-strong); flex: none }

    .actions { display: grid; gap: .5rem }
    button {
        min-height: 48px; padding: 0 1.25rem; border-radius: 999px; cursor: pointer; font-size: 1rem;
        display: inline-flex; align-items: center; justify-content: center; gap: .5rem;
        border: 1px solid var(--line); background: var(--surface); color: var(--fg);
        transition: background 160ms var(--ease), border-color 160ms var(--ease);
        &:hover { border-color: var(--accent) }
        &:focus-visible { box-shadow: 0 0 0 5px var(--accent-tint) }
    }
    button.primary { background: var(--accent-strong); border-color: transparent; color: var(--page) }
    button.primary:hover { filter: brightness( 1.08 ) }
    .note { color: var(--faint); font-size: .82rem; text-align: center }
`

/**
 * Home screen on load when not signed in: sign in, or continue without an account (local-only).
 * Shown once per page load: dismissing lives in memory, so the next load asks again.
 * Until the session check answers, a device that has synced before (it has an owner) is assumed signed in,
 * so signed-in users never see it flash.
 */
export default function Welcome() {

    const account = use_app_store( state => state.account )
    const [ dismissed, set_dismissed ] = useState( skipped )
    const { pathname } = useLocation()
    const navigate = useNavigate()

    // Once this load is known to be signed in, it's settled: signing out later doesn't pop the screen
    if( account?.signed_in && !dismissed ) set_dismissed( true )

    const signed_out = account ? !account.signed_in : !local_owner()
    if( dismissed || !signed_out || EXEMPT.some( path => pathname.startsWith( path ) ) ) return null

    const sign_in = () => {
        set_dismissed( true )
        navigate( `/signin` )
    }

    // role="dialog" also pauses the global shortcuts underneath
    return <Screen>
        <div role="dialog" aria-modal="true" aria-label="Welcome to Dolist">
            <span className="brand"><img src="/favicon.svg" alt="" />Dolist</span>

            <div>
                <h1>Sign in to keep your tasks on every device</h1>
                <p className="lede">Works offline. Syncs when you're signed in.</p>
            </div>

            <ul>
                <li><RefreshCw size={ 18 } strokeWidth={ 1.5 } aria-hidden />Sync across phone, laptop and tablet</li>
                <li><CalendarDays size={ 18 } strokeWidth={ 1.5 } aria-hidden />Capture in plain words: “call mum tom at 5”</li>
                <li><Columns3 size={ 18 } strokeWidth={ 1.5 } aria-hidden />Plan by horizon: today, this week, this month</li>
            </ul>

            <div className="actions">
                <button className="primary" onClick={ sign_in } autoFocus><LogIn size={ 18 } strokeWidth={ 1.5 } aria-hidden />Sign in or create account</button>
                <button onClick={ () => set_dismissed( true ) }>Continue without login</button>
            </div>
            <p className="note">Without an account, tasks stay on this device.</p>
        </div>
    </Screen>
}
