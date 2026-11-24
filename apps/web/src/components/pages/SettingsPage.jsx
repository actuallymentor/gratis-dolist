import { useState } from 'react'
import styled from 'styled-components'
import { RefreshCw } from 'lucide-react'
import Page from '../atoms/Page'
import { apply_theme, read_theme } from '../../modules/theme'
import { hard_update } from '../../modules/pwa'
import { build_hash } from '../../modules/build'

const Rows = styled.div`
    display: grid; gap: .25rem;
    border: 1px solid var(--line); border-radius: var(--radius); background: var(--surface);

    .row { display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding: .75rem 1rem; min-height: 3.5rem }
    .row + .row { border-top: 1px solid var(--line-soft) }
    .row small { display: block; color: var(--muted); font-size: .85rem }

    select, button {
        min-height: 44px; padding: 0 .9rem; border-radius: 999px; cursor: pointer;
        border: 1px solid var(--line); background: var(--page);
    }
    button { display: inline-flex; align-items: center; gap: .4rem; font-size: .94rem }
`

const Build = styled.p`
    margin-top: 1.5rem; color: var(--faint); font-size: .8rem; text-align: center;
    code { font-size: .95em }
`

export default function SettingsPage() {

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
        <Build>Build <code>{ build_hash }</code></Build>
    </Page>
}
