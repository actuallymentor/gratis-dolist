import { useState } from 'react'
import { Link } from 'react-router'
import styled from 'styled-components'
import { Download, RefreshCw, Share, Upload } from 'lucide-react'
import toast from 'react-hot-toast'
import { from_todoist } from '@dolist/core'
import { export_json, import_json, import_todoist } from '@dolist/store'
import { use_store } from '@dolist/store/react'
import { download_json, fetch_todoist } from '../../modules/todoist'
import { flush } from '../../modules/dolist'
import Page from '../atoms/Page'
import SyncSection from '../molecules/SyncSection'
import { apply_theme, read_theme } from '../../modules/theme'
import { hard_update, is_ios, is_standalone } from '../../modules/pwa'
import { build_hash } from '../../modules/build'

const Rows = styled.div`
    display: grid; gap: .25rem;
    border: 1px solid var(--line); border-radius: var(--radius); background: var(--surface);

    .row { display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding: .75rem 1rem; min-height: 3.5rem }
    .row + .row { border-top: 1px solid var(--line-soft) }
    .row small { display: block; color: var(--muted); font-size: .85rem }

    .row a { min-height: 44px; display: inline-flex; align-items: center; padding: 0 .9rem; color: var(--accent-strong) }
    .row form { display: flex; gap: .5rem; flex-wrap: wrap; justify-content: flex-end }
    input[type="password"], input.code { min-height: 44px; padding: 0 .9rem; border-radius: 999px; border: 1px solid var(--line); background: var(--page); width: 14rem; max-width: 100% }
    input.code { font-family: var(--font-mono, ui-monospace, monospace); text-transform: uppercase }
    code.codes { display: block; white-space: pre; margin-top: .6rem; font-size: .9rem; line-height: 1.6 }
    code.pair { font-size: 1rem; color: var(--fg); user-select: all; overflow-wrap: anywhere }
    .file { position: relative; overflow: hidden }
    .file input { position: absolute; inset: 0; opacity: 0; cursor: pointer }
    @media ( max-width: 560px ) { .row { flex-wrap: wrap } }

    select, button, .file {
        min-height: 44px; padding: 0 .9rem; border-radius: 999px; cursor: pointer;
        border: 1px solid var(--line); background: var(--page);
    }
    button, .file { display: inline-flex; align-items: center; gap: .4rem; font-size: .94rem; white-space: nowrap; flex-shrink: 0 }
`

const Section = styled.h2`
    font: 600 .9rem var(--font-body); color: var(--muted); margin: 2rem 0 .6rem;
`

const Build = styled.p`
    margin-top: 1.5rem; color: var(--faint); font-size: .8rem; text-align: center;
    code { font-size: .95em }
`

export default function SettingsPage() {

    const store = use_store()
    const [ token, set_token ] = useState( `` )
    const [ importing, set_importing ] = useState( false )

    const export_data = () => download_json( `dolist-${ new Date().toISOString().slice( 0, 10 ) }.json`, export_json( store ) )

    const import_file = async ( { target } ) => {
        const [ file ] = target.files
        target.value = ``
        if( !file ) return
        try {
            const json = JSON.parse( await file.text() )

            // Accept both our own export and a raw Todoist export (scripts/todoist-export.mjs)
            if( json.app !== `dolist` && json.tasks && json.projects ) await import_todoist( store, from_todoist( json ) )
            else await import_json( store, json )

            // Announce only once everything is on disk
            await flush()
            toast( `Imported` )
        } catch ( error ) {
            toast( `Import failed: ${ error.message }` )
        }
    }

    // Token is used once and dropped; nothing about it is persisted or logged
    const import_from_todoist = async event => {
        event.preventDefault()
        if( !token.trim() || importing ) return
        set_importing( true )
        try {
            const raw = await fetch_todoist( token.trim() )
            const result = await import_todoist( store, from_todoist( raw ) )
            await flush()
            toast( `Imported ${ result?.tasks ?? raw.tasks.length } tasks from Todoist` )
        } catch ( error ) {
            toast( error.message )
        } finally {
            set_token( `` )
            set_importing( false )
        }
    }

    const [ theme, set_theme ] = useState( read_theme )
    const change_theme = ( { target: { value } } ) => {
        set_theme( value )
        apply_theme( value )
    }

    // Refuses offline instead of discarding the working cached app
    const [ update_note, set_update_note ] = useState( `Updates install automatically. Use this if something looks stale.` )
    const update = async () => {
        const updated = await hard_update()
        if( !updated ) set_update_note( `You're offline. Try again once you're connected.` )
    }

    return <Page title="Settings">
        <Rows>
            <label className="row">
                <span>Theme</span>
                <select value={ theme } onChange={ change_theme }>
                    <option value="system">Match system</option>
                    <option value="light">Light</option>
                    <option value="dark">Dark</option>
                </select>
            </label>
            { is_ios() && !is_standalone() && <div className="row" aria-label="Install on iPhone">
                <span>
                    Install app
                    <small>Tap <Share size={ 14 } strokeWidth={ 1.5 } aria-label="Share" /> in Safari, then <strong>Add to Home Screen</strong>. Dolist then opens straight to a new task.</small>
                </span>
            </div> }
            <div className="row">
                <span>
                    Update app
                    <small role="status">{ update_note }</small>
                </span>
                <button onClick={ update }>
                    <RefreshCw size={ 16 } strokeWidth={ 1.5 } aria-hidden /> Update
                </button>
            </div>
        </Rows>
        <Section>Sync</Section>
        <Rows>
            <SyncSection />
        </Rows>
        <Section>Your data</Section>
        <Rows>
            <div className="row">
                <span>Completed tasks<small>History, with reopen.</small></span>
                <Link to="/completed">Open</Link>
            </div>
            <div className="row">
                <span>Export<small>Everything, as one JSON file.</small></span>
                <button onClick={ export_data }><Download size={ 16 } strokeWidth={ 1.5 } aria-hidden /> Export</button>
            </div>
            <div className="row">
                <span>Import file<small>A Dolist export or a Todoist export. Merges, never deletes.</small></span>
                <label className="file"><Upload size={ 16 } strokeWidth={ 1.5 } aria-hidden /> Choose file
                    <input type="file" accept="application/json,.json" onChange={ import_file } aria-label="Import file" />
                </label>
            </div>
            <div className="row">
                <span>Import from Todoist<small>Paste your API token (Todoist → Settings → Integrations → Developer). Used once, never stored.</small></span>
                <form onSubmit={ import_from_todoist }>
                    <input type="password" value={ token } onChange={ ( { target: { value } } ) => set_token( value ) } placeholder="API token" aria-label="Todoist API token" autoComplete="off" />
                    <button disabled={ importing }>{ importing ? `Importing…` : `Import` }</button>
                </form>
            </div>
        </Rows>

        <Build>Build <code>{ build_hash }</code></Build>
    </Page>
}
