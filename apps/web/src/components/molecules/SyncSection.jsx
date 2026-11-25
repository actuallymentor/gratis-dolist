import { useEffect, useState } from 'react'
import { Download, KeyRound, Link2, LogOut, Save, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { use_app_store } from '../../stores/app'
import { announce_account_change, api, begin_sync, device_label, end_sync, refresh_account } from '../../modules/sync'
import { download_json } from '../../modules/todoist'

const STATUS = {
    off: `Not syncing`,
    connecting: `Connecting…`,
    synced: `Synced`,
    offline: `Offline. Changes stay on this device and sync when you're back.`,
    signed_out: `This device was signed out. Your tasks are still here.`,
}

const when = ms => new Date( ms ).toLocaleString( undefined, { dateStyle: `medium`, timeStyle: `short` } )

/**
 * Settings → Sync: sign in with one code (enrollment, pairing or recovery), pair devices,
 * see + revoke devices, nightly backups (download one, then Import file = restore).
 * Renders rows for the parent's <Rows> container.
 */
export default function SyncSection() {

    const account = use_app_store( state => state.account )
    const status = use_app_store( state => state.sync_status )
    const [ code, set_code ] = useState( `` )
    const [ busy, set_busy ] = useState( false )
    const [ recovery, set_recovery ] = useState( null )
    const [ pairing, set_pairing ] = useState( null )
    const [ devices, set_devices ] = useState( [] )
    const [ backups, set_backups ] = useState( [] )

    const signed_in = !!account?.signed_in

    // Devices + backups load independently (a backup outage must never hide Sign out), and again once
    // sync recovers; a failed load keeps what was shown
    const load_lists = () => {
        api( `/api/devices` ).then( set_devices, () => {} )
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

    const sign_in = async event => {
        event.preventDefault()
        if( !code.trim() || busy ) return
        set_busy( true )
        try {
            const { recovery_codes } = await api( `/api/login`, { method: `POST`, body: { code: code.trim(), label: device_label() } } )
            set_code( `` )
            if( recovery_codes ) set_recovery( recovery_codes )
            await begin_sync()
            announce_account_change()
            toast( `Signed in. Syncing.` )
        } catch ( error ) {
            toast( error.message )
        } finally {
            set_busy( false )
        }
    }

    const pair = async () => {
        try {
            set_pairing( await api( `/api/pair`, { method: `POST` } ) )
        } catch ( error ) {
            toast( error.message )
        }
    }

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

    // Shown once, right after enrollment
    if( recovery ) return <div className="row">
        <span>
            Recovery codes
            <small>Each signs in once if you lose every device. Save them somewhere safe, they won't be shown again.</small>
            <code className="codes" aria-label="Recovery codes">{ recovery.join( `\n` ) }</code>
        </span>
        <form onSubmit={ event => event.preventDefault() }>
            <button type="button" onClick={ () => download_json( `dolist-recovery-codes.txt`, recovery.join( `\n` ) ) }><Download size={ 16 } strokeWidth={ 1.5 } aria-hidden /> Download</button>
            <button type="button" onClick={ () => set_recovery( null ) }>I saved them</button>
        </form>
    </div>

    if( !signed_in ) return <div className="row">
        <span>
            Sync across devices
            <small role="status">{ status === `signed_out` ? STATUS.signed_out : `First device: your enrollment code. Others: a pairing code from a signed-in device, or a recovery code.` }</small>
        </span>
        <form onSubmit={ sign_in }>
            <input className="code" value={ code } onChange={ ( { target: { value } } ) => set_code( value ) } placeholder="Code" aria-label="Sign-in code" autoComplete="one-time-code" autoCapitalize="characters" spellCheck={ false } />
            <button disabled={ busy }><KeyRound size={ 16 } strokeWidth={ 1.5 } aria-hidden /> { busy ? `Signing in…` : `Sign in` }</button>
        </form>
    </div>

    return <>
        <div className="row">
            <span>Sync<small role="status" aria-label="Sync status">{ STATUS[ status ] ?? status }</small></span>
        </div>

        <div className="row">
            <span>
                Pair a device
                <small>{ pairing
                    ? <>On the other device: Settings → Sync → enter <code className="pair" aria-label="Pairing code">{ pairing.code }</code>. Works once, until { new Date( pairing.expires ).toLocaleTimeString( undefined, { timeStyle: `short` } ) }.</>
                    : `Shows a one-time code to sign in another phone or computer.` }</small>
            </span>
            <button onClick={ pair }><Link2 size={ 16 } strokeWidth={ 1.5 } aria-hidden /> { pairing ? `New code` : `Pair` }</button>
        </div>

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
