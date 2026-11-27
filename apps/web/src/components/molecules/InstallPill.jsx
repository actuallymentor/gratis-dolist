import { useState } from 'react'
import styled from 'styled-components'
import { Download, X } from 'lucide-react'
import Pill from '../atoms/Pill'
import { use_app_store } from '../../stores/app'
import { is_standalone } from '../../modules/pwa'

// Dismissed once = gone on this device; Settings keeps an Install row while the browser offers it
const KEY = `dolist:install-dismissed`
const was_dismissed = () => {
    try {
        return localStorage.getItem( KEY ) === `1`
    } catch {
        return false
    }
}

// The pill is a group of two buttons: install (the face) and a quiet ×
const Group = styled( Pill )`
    padding: 0; gap: 0; cursor: default;
    &:hover, &:active { transform: none }

    button { display: inline-flex; align-items: center; gap: .4rem; min-height: 44px; border: 0; background: none; color: inherit; font: inherit; cursor: pointer }
    .install { padding: 0 .5rem 0 1rem }
    .dismiss { justify-content: center; width: 40px; padding: 0 .35rem 0 0; color: var(--faint); border-radius: 0 999px 999px 0 }
    .dismiss:hover { color: var(--fg) }
    button:focus-visible { box-shadow: 0 0 0 4px var(--accent-tint); border-radius: 999px }
`

// "Install app": only when the browser offered an install prompt and we're not already installed.
// iOS has no prompt; its how-to is a row in Settings, never floating over content.
export default function InstallPill() {

    const install_prompt = use_app_store( state => state.install_prompt )
    const set_install_prompt = use_app_store( state => state.set_install_prompt )
    const [ dismissed, set_dismissed ] = useState( was_dismissed )
    if( !install_prompt || dismissed || is_standalone() ) return null

    const install = async () => {
        await install_prompt.prompt()
        set_install_prompt( null )
    }

    const dismiss = () => {
        set_dismissed( true )
        try {
            localStorage.setItem( KEY, `1` )
        } catch { /* private mode: hidden for this session */ }
    }

    return <Group as="div" role="group" aria-label="Install app">
        <button type="button" className="install" onClick={ install }>
            <Download size={ 16 } strokeWidth={ 1.5 } aria-hidden />
            Install app
        </button>
        <button type="button" className="dismiss" onClick={ dismiss } aria-label="Dismiss install" title="Dismiss (Settings keeps an Install option)">
            <X size={ 16 } strokeWidth={ 1.75 } aria-hidden />
        </button>
    </Group>
}
