import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import styled from 'styled-components'
import { Check, Share2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { add_task } from '@dolist/store'
import { use_store } from '@dolist/store/react'
import Page from '../atoms/Page'
import QuickAdd from '../molecules/QuickAdd'
import { shared_task } from '../../modules/share'
import { flush } from '../../modules/dolist'
import { adopt_orphan_draft, read_draft, write_draft } from '../../modules/drafts'

// A pending share is its own draft (survives navigation, reload, relaunch) until added or discarded
const SHARE = `share`
const read_share = () => {
    try {
        return JSON.parse( read_draft( SHARE ) || `null` )
    } catch {
        return null
    }
}
const write_share = share => write_draft( SHARE, share ? JSON.stringify( share ) : `` )

// One share, one task: the id comes from the share itself (SHA-256), so a retry, a cloned tab or the share
// reopened from history all land on the same task
const share_id = async source => {
    const digest = await crypto.subtle.digest( `SHA-256`, new TextEncoder().encode( source ) )
    return `share-${ [ ...new Uint8Array( digest ) ].slice( 0, 16 ).map( byte => byte.toString( 16 ).padStart( 2, `0` ) ).join( `` ) }`
}

const Added = styled.ul`
    list-style: none; padding: 0; margin: 0; display: grid; gap: .35rem;
    li { display: flex; align-items: center; gap: .5rem; color: var(--muted); animation: enter 300ms var(--ease) }
    li svg { color: var(--accent) }
    @keyframes enter { from { opacity: 0; transform: translateY( 4px ) } }
`

const Shared = styled.form`
    display: grid; gap: .6rem; padding: 1rem; margin-bottom: 1.25rem;
    border: 1px solid var(--accent); border-radius: var(--radius); background: var(--surface);

    .label { display: flex; align-items: center; gap: .4rem; color: var(--muted); font-size: .85rem }
    input { font: 500 1rem/1.5 var(--font-body); padding: .4rem .6rem; border: 1px solid var(--line-soft); border-radius: var(--radius-sm); background: var(--page) }
    .notes { color: var(--muted); font-size: .88rem; white-space: pre-wrap; overflow-wrap: anywhere; max-height: 8rem; overflow: auto }
    .actions { display: flex; gap: .5rem; flex-wrap: wrap }
    button { min-height: 44px; padding: 0 1rem; border-radius: 999px; cursor: pointer; border: 1px solid var(--line); background: var(--page) }
    button[type="submit"] { background: var(--accent-strong); border-color: transparent; color: #fff }
`

const Footer = styled.p`
    margin-top: 1.5rem; color: var(--muted); font-size: .9rem;
    a { color: var(--accent-strong) }
`

/**
 * Capture-first screen: the installed app's start URL, its "Add task" shortcut and its share target.
 * One focused line with the accessory row, a quiet list of what just landed in the Inbox, and,
 * for content shared from another app, a separate card (never mixed into the draft, never parsed as grammar).
 */
export default function CapturePage() {

    const store = use_store()
    const [ params ] = useSearchParams()
    const navigate = useNavigate()
    const [ added, set_added ] = useState( [] )
    const remember = title => set_added( list => [ title, ...list ].slice( 0, 5 ) )

    // A new share (URL) wins over a pending one; the same share reloaded keeps its edits (draft remembers its source)
    const [ share, set_share ] = useState( () => {
        const pending = read_share()
        const source = params.toString()
        const incoming = shared_task( params )
        if( !incoming || pending?.source === source ) return pending
        return { ...incoming, source }
    } )
    const [ saving, set_saving ] = useState( false )
    useEffect( () => {
        write_share( share )
    }, [ share ] )

    // A share left pending in a closed tab comes back here
    useEffect( () => {
        if( !share ) adopt_orphan_draft( SHARE ).then( adopted => adopted && set_share( read_share() ) )
    }, [] )

    const clear_share = () => {
        set_share( null )
        write_share( null )
        if( params.size ) navigate( `/capture`, { replace: true } )
    }

    const add_share = async event => {
        event.preventDefault()
        const title = share.title.trim()
        if( !title || saving ) return
        set_saving( true )
        const id = await share_id( share.source ?? `${ share.title }\n${ share.notes }` )

        // Already added (and maybe edited since): leave it exactly as it is
        const exists = store.hasRow( `tasks`, id )
        if( !exists ) add_task( store, { id, title, notes: share.notes || undefined } )
        try {
            await flush()
            remember( title )
            clear_share()
            if( exists ) toast( `Already in your tasks` )
        } catch {
            toast( `Couldn't save it on this device. Try again once storage frees up.` )
        } finally {
            set_saving( false )
        }
    }

    return <Page title="Add a task">
        { share && <Shared onSubmit={ add_share } aria-label="Shared">
            <span className="label"><Share2 size={ 14 } strokeWidth={ 1.5 } aria-hidden /> Shared with Dolist</span>
            <input value={ share.title } onChange={ ( { target: { value } } ) => set_share( { ...share, title: value } ) } aria-label="Shared task title" />
            { share.notes && <p className="notes" aria-label="Shared notes">{ share.notes }</p> }
            <div className="actions">
                <button type="submit" disabled={ saving }>Add to Inbox</button>
                <button type="button" onClick={ clear_share }>Discard</button>
            </div>
        </Shared> }
        <QuickAdd autofocus={ !share } accessory placeholder="What's on your mind?" on_added={ remember } />
        { !!added.length && <Added aria-label="Just added">
            { added.map( ( title, index ) => <li key={ `${ index }-${ title }` }><Check size={ 16 } strokeWidth={ 1.5 } aria-hidden /> { title }</li> ) }
        </Added> }
        <Footer>Everything lands in your <Link to="/inbox">Inbox</Link>.</Footer>
    </Page>
}
