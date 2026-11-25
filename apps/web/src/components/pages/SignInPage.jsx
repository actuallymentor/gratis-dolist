import { useEffect, useRef, useState } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router'
import styled from 'styled-components'
import { Fingerprint, Mail, UserPlus } from 'lucide-react'
import toast from 'react-hot-toast'
import Page from '../atoms/Page'
import { use_app_store } from '../../stores/app'
import { create_passkey, email_sign_in, passkey_sign_in, passkeys_supported, requested_link_here, send_email_link } from '../../modules/account'

const Card = styled.section`
    display: grid; gap: 1rem; max-width: 26rem;
    padding: 1.5rem; border: 1px solid var(--line); border-radius: var(--radius); background: var(--surface);

    p { color: var(--muted); font-size: .92rem }
    form { display: grid; gap: .6rem }
    label { display: grid; gap: .35rem; font-size: .9rem }
    input {
        min-height: 44px; padding: 0 .9rem; border-radius: var(--radius-sm);
        border: 1px solid var(--line); background: var(--page); font-size: 1rem;
    }
    input.code { font-family: var(--font-mono, ui-monospace, monospace); text-transform: uppercase; letter-spacing: .08em }

    button {
        min-height: 44px; padding: 0 1rem; border-radius: 999px; cursor: pointer;
        display: inline-flex; align-items: center; justify-content: center; gap: .5rem; font-size: .95rem;
        border: 1px solid var(--line); background: var(--page); color: var(--fg);
    }
    button.primary { background: var(--accent-strong); border-color: transparent; color: #fff }
    button:disabled { opacity: .6; cursor: default }
    button.link { min-height: 44px; border: 0; background: none; padding: 0; justify-content: flex-start; color: var(--accent-strong); text-decoration: underline }

    .or { display: flex; align-items: center; gap: .75rem; color: var(--faint); font-size: .85rem }
    .or::before, .or::after { content: ""; flex: 1; border-top: 1px solid var(--line-soft) }
`

/**
 * Sign in or create an account: passkey, or an email link (whose code also works in the installed app,
 * which the link can't open). Without an account the app works the same, on this device only.
 */
export default function SignInPage() {

    const account = use_app_store( state => state.account )
    const navigate = useNavigate()
    const [ params, set_params ] = useSearchParams()
    const token = params.get( `token` )

    const [ email, set_email ] = useState( `` )
    const [ sent_to, set_sent_to ] = useState( null )
    const [ code, set_code ] = useState( `` )
    const [ busy, set_busy ] = useState( false )
    const [ offer_passkey, set_offer_passkey ] = useState( false )
    const supported = passkeys_supported()

    // Done: Settings shows sync, devices and passkeys
    const finish = message => {
        toast( message )
        navigate( `/settings`, { replace: true } )
    }

    // Email sign-in done: offer a passkey once, so next time is one tap
    const after_email = result => {
        if( result.added ) return finish( `Email added` )
        if( supported ) return set_offer_passkey( true )
        finish( result.created ? `Account created. Syncing.` : `Signed in. Syncing.` )
    }

    // Runs one action at a time; errors become a toast
    const run = async action => {
        if( busy ) return
        set_busy( true )
        try {
            await action()
        } catch ( error ) {
            toast( error.message )
        } finally {
            set_busy( false )
        }
    }

    // Opened from the email: use the token once, then drop it from the URL (history, screenshots).
    // A link this browser never asked for (someone else's, sent to you) asks first: using it would sign
    // you into their account
    const used_token = useRef( false )
    const [ unasked_token, set_unasked_token ] = useState( null )
    const use_token = link_token => run( async () => after_email( await email_sign_in( { token: link_token } ) ) )
    useEffect( () => {
        if( !token || used_token.current ) return
        used_token.current = true
        set_params( {}, { replace: true } )
        if( requested_link_here() || account?.signed_in ) use_token( token )
        else set_unasked_token( token )
    }, [ token ] )

    const send = event => {
        event.preventDefault()
        if( !email.trim() ) return
        run( async () => {
            const { sent_to } = await send_email_link( email.trim() )
            set_sent_to( sent_to )
        } )
    }

    const use_code = event => {
        event.preventDefault()
        if( !code.trim() ) return
        run( async () => after_email( await email_sign_in( { email: sent_to, code: code.trim() } ) ) )
    }

    const with_passkey = () => run( async () => {
        if( await passkey_sign_in() ) finish( `Signed in. Syncing.` )
    } )

    const new_with_passkey = () => run( async () => {
        if( await create_passkey( true ) ) finish( `Account created. Syncing.` )
    } )

    const add_passkey = () => run( async () => {
        if( await create_passkey( false ) ) finish( `Passkey added. Syncing.` )
    } )

    if( offer_passkey ) return <Page title="Signed in">
        <Card>
            <p>Add a passkey so next time you sign in with your fingerprint, face or device PIN. No email needed.</p>
            <button className="primary" onClick={ add_passkey } disabled={ busy }><Fingerprint size={ 18 } strokeWidth={ 1.5 } aria-hidden /> Add a passkey</button>
            <button onClick={ () => finish( `Signed in. Syncing.` ) }>Not now</button>
        </Card>
    </Page>

    if( unasked_token ) return <Page title="Finish signing in?">
        <Card>
            <p>This browser didn't ask for this sign-in link. Continue only if you asked for it yourself, from another device or app. A link from someone else signs you into their account.</p>
            <button className="primary" onClick={ () => {
                set_unasked_token( null )
                use_token( unasked_token )
            } } disabled={ busy }
            >Continue</button>
            <button onClick={ () => set_unasked_token( null ) }>Cancel</button>
        </Card>
    </Page>

    // Already in (and not mid-way through a link): nothing to do here
    if( account?.signed_in && !token && !busy ) return <Navigate to="/settings" replace />

    return <Page title="Sign in" subtitle="or create an account">
        <Card>
            <p>An account syncs your tasks across devices. Without one, everything still works on this device.</p>

            { supported && <>
                <button className="primary" onClick={ with_passkey } disabled={ busy }><Fingerprint size={ 18 } strokeWidth={ 1.5 } aria-hidden /> Sign in with a passkey</button>
                <span className="or">or use email</span>
            </> }

            { !sent_to && <form onSubmit={ send }>
                <label>
                    Email
                    <input type="email" value={ email } onChange={ ( { target: { value } } ) => set_email( value ) } autoComplete="email" placeholder="you@example.com" required />
                </label>
                <button className={ supported ? undefined : `primary` } disabled={ busy }><Mail size={ 18 } strokeWidth={ 1.5 } aria-hidden /> { busy ? `Sending…` : `Email me a link` }</button>
            </form> }

            { sent_to && <form onSubmit={ use_code }>
                <p role="status">Sent to { sent_to }. Open the link in that email, or type its code here:</p>
                <label>
                    Code from the email
                    <input className="code" value={ code } onChange={ ( { target: { value } } ) => set_code( value ) } autoComplete="one-time-code" autoCapitalize="characters" spellCheck={ false } required />
                </label>
                <button className="primary" disabled={ busy }>{ busy ? `Signing in…` : `Sign in` }</button>
                <button type="button" className="link" onClick={ () => {
                    set_sent_to( null )
                    set_code( `` )
                } }
                >Use another email</button>
            </form> }

            { supported && <>
                <span className="or">new here?</span>
                <button onClick={ new_with_passkey } disabled={ busy }><UserPlus size={ 18 } strokeWidth={ 1.5 } aria-hidden /> Create an account with a passkey</button>
                <p>An email link also creates your account if you don't have one.</p>
            </> }
        </Card>
    </Page>
}
