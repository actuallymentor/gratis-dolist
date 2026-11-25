import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { Download, Fingerprint, LogIn, LogOut, Mail, Save, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { use_app_store } from '../../stores/app'
import { announce_account_change, api, end_sync, refresh_account } from '../../modules/sync'
import { create_passkey, email_sign_in, passkeys_supported, send_email_link } from '../../modules/account'

const STATUS = {
    off: `Not syncing`,
    connecting: `Connecting…`,
    synced: `Synced`,
    offline: `Offline. Changes stay on this device and sync when you're back.`,
    signed_out: `This device was signed out. Your tasks are still here.`,
}

const when = ms => new Date( ms ).toLocaleString( undefined, { dateStyle: `medium`, timeStyle: `short` } )
const icon = { size: 16, strokeWidth: 1.5, 'aria-hidden': true }

/**
 * Settings → Sync: account (email, passkeys), devices with sign out, nightly backups
 * (download one, then Import file = restore). Signing in lives on /signin.
 * Renders rows for the parent's <Rows> container.
 */
export default function SyncSection() {

    const account = use_app_store( state => state.account )
    const status = use_app_store( state => state.sync_status )
    const [ devices, set_devices ] = useState( [] )
    const [ passkeys, set_passkeys ] = useState( [] )
    const [ backups, set_backups ] = useState( [] )

    // Adding an email: address, then the code from the mail
    const [ new_email, set_new_email ] = useState( `` )
    const [ email_sent_to, set_email_sent_to ] = useState( null )
    const [ email_code, set_email_code ] = useState( `` )

    const signed_in = !!account?.signed_in

    // Lists load independently (a backup outage must never hide Sign out), and again once sync recovers;
    // a failed load keeps what was shown
    const load_lists = () => {
        api( `/api/devices` ).then( set_devices, () => {} )
        api( `/api/passkeys` ).then( set_passkeys, () => {} )
        api( `/api/snapshots` ).then( set_backups, () => {} )
    }
    const synced = status === `synced`
    useEffect( () => {
        if( signed_in ) load_lists()
    }, [ signed_in, synced ] )

    // Fresh session state whenever Settings opens
    useEffect( () => {
        refresh_account()
    }, [] )

    // Every action: errors become a toast
    const attempt = action => async ( ...args ) => {
        try {
            await action( ...args )
        } catch ( error ) {
            toast( error.message )
        }
    }

    const add_passkey = attempt( async () => {
        if( !await create_passkey( false ) ) return
        toast( `Passkey added` )
        load_lists()
    } )

    const remove_passkey = attempt( async key => {
        await api( `/api/passkeys/${ encodeURIComponent( key.id ) }`, { method: `DELETE` } )
        toast( `Passkey removed. Also delete it from your password manager.` )
        load_lists()
    } )

    const send_email = attempt( async event => {
        event.preventDefault()
        const { sent_to } = await send_email_link( new_email.trim() )
        set_email_sent_to( sent_to )
    } )

    const confirm_email = attempt( async event => {
        event.preventDefault()
        await email_sign_in( { email: email_sent_to, code: email_code.trim() } )
        set_email_sent_to( null )
        set_email_code( `` )
        set_new_email( `` )
        await refresh_account()
        toast( `Email added` )
    } )

    const revoke = async device => {
        const self = device.id === account?.session_id
        try {
            await api( self ? `/api/logout` : `/api/devices/${ device.id }`, { method: self ? `POST` : `DELETE` } )
            if( self ) {
                end_sync()
                announce_account_change()
                await refresh_account()
                use_app_store.getState().set_sync_status( `off` )
                return toast( `Signed out. Your tasks stay on this device.` )
            }
            toast( `Signed out “${ device.label }”` )
            load_lists()
        } catch ( error ) {
            toast( error.message )
        }
    }

    // Only while synced: then this device's changes are on the server, so the backup includes them
    const back_up = async () => {
        if( status !== `synced` ) return toast( `Wait until this device is synced, so the backup includes your latest changes` )
        try {
            await api( `/api/snapshots`, { method: `POST` } )
            toast( `Backed up` )
            load_lists()
        } catch ( error ) {
            toast( error.message )
        }
    }

    if( !signed_in ) return <div className="row">
        <span>
            Sync across devices
            <small role="status">{ status === `signed_out` ? STATUS.signed_out : `Sign in with a passkey or an email link. Your tasks stay on this device either way.` }</small>
        </span>
        <Link to="/signin"><LogIn { ...icon } /> Sign in</Link>
    </div>

    return <>
        <div className="row">
            <span>Sync<small role="status" aria-label="Sync status">{ STATUS[ status ] ?? status }</small></span>
        </div>

        <div className="row">
            <span>Email<small>{ account.email ?? `None yet. Add one to sign in with an email link.` }</small></span>
            { !account.email && !email_sent_to && <form onSubmit={ send_email }>
                <input className="email" type="email" value={ new_email } onChange={ ( { target: { value } } ) => set_new_email( value ) } placeholder="you@example.com" aria-label="New email" autoComplete="email" required />
                <button><Mail { ...icon } /> Add email</button>
            </form> }
            { email_sent_to && <form onSubmit={ confirm_email }>
                <input className="code" value={ email_code } onChange={ ( { target: { value } } ) => set_email_code( value ) } placeholder="Code" aria-label="Code from the email" autoComplete="one-time-code" spellCheck={ false } required />
                <button>Confirm</button>
            </form> }
        </div>

        { passkeys.map( key => <div className="row" key={ key.id }>
            <span>Passkey: { key.label }<small>Added { when( key.created ) }{ key.last_used ? `, last used ${ when( key.last_used ) }` : `` }</small></span>
            <button onClick={ () => remove_passkey( key ) } aria-label={ `Remove passkey ${ key.label }` }><Trash2 { ...icon } /> Remove</button>
        </div> ) }
        { passkeys_supported() && <div className="row">
            <span>{ passkeys.length ? `Another passkey` : `Passkey` }<small>Sign in with your fingerprint, face or device PIN.</small></span>
            <button onClick={ add_passkey }><Fingerprint { ...icon } /> Add passkey</button>
        </div> }

        { devices.map( device => {
            const self = device.id === account?.session_id
            return <div className="row" key={ device.id } data-device={ device.label }>
                <span>{ device.label }{ self ? ` (this device)` : `` }<small>Signed in { when( device.created ) }</small></span>
                <button onClick={ () => revoke( device ) } aria-label={ self ? `Sign out` : `Sign out ${ device.label }` }>
                    { self ? <LogOut size={ 16 } strokeWidth={ 1.5 } aria-hidden /> : <Trash2 size={ 16 } strokeWidth={ 1.5 } aria-hidden /> } Sign out
                </button>
            </div>
        } ) }

        <div className="row">
            <span>Backups<small>Nightly, last 30 kept. To restore, download one and use Import file below: tasks in the backup return as they were then, tasks added since stay.</small></span>
            <button onClick={ back_up } aria-disabled={ status !== `synced` }><Save size={ 16 } strokeWidth={ 1.5 } aria-hidden /> Back up now</button>
        </div>
        { backups.slice( 0, 5 ).map( ( { name, uploaded } ) => <div className="row" key={ name }>
            <span>{ when( Date.parse( uploaded ) ) }</span>
            <a href={ `/api/snapshots/${ encodeURIComponent( name ) }` } download aria-label={ `Download backup ${ when( Date.parse( uploaded ) ) }` }><Download size={ 16 } strokeWidth={ 1.5 } aria-hidden /> Download</a>
        </div> ) }
    </>
}
