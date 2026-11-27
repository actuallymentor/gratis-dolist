import { create } from 'zustand'
import { hold_unsaved } from '../modules/unsaved'
import { read_keymap, write_keymap } from '../modules/keymap'
import { read_layout, write_layout } from '../modules/sidebar'

/**
 * UI-only state shared across components. Task data never lives here (plan §1: zustand for UI state only).
 * - update_ready: a new service worker is waiting and could not auto-activate
 * - install_prompt: the deferred `beforeinstallprompt` event, if the browser offered one
 * - unsaved: ids of components holding unsent input (drafts), which block silent auto-updates
 * - session_checked: the first /api/session attempt finished (answered or failed offline)
 * - quick_add_open: the global capture modal (`n`) is showing
 * - keymap: action → combo (modules/keymap); sidebar: { order, hidden } (modules/sidebar); both per device
 * - sidebar_settings_open: the sidebar customize modal is showing
 * - account: server session ( null = not checked yet ); sync_status: off | connecting | synced | offline | signed_out | other_account
 */
export const use_app_store = create( set => ( {
    update_ready: false,
    install_prompt: null,
    unsaved: new Set(),
    account: null,
    sync_status: `off`,
    quick_add_open: false,
    session_checked: false,
    keymap: read_keymap(),
    sidebar: read_layout(),
    sidebar_settings_open: false,

    set_update_ready: update_ready => set( { update_ready } ),
    set_install_prompt: install_prompt => set( { install_prompt } ),
    set_account: account => set( { account } ),
    set_sync_status: sync_status => set( { sync_status } ),
    set_session_checked: session_checked => set( { session_checked } ),
    set_quick_add_open: quick_add_open => set( { quick_add_open } ),
    set_sidebar_settings_open: sidebar_settings_open => set( { sidebar_settings_open } ),
    set_keymap: keymap => {
        write_keymap( keymap )
        set( { keymap } )
    },
    set_sidebar: sidebar => {
        write_layout( sidebar )
        set( { sidebar } )
    },
    mark_unsaved: ( id, dirty ) => set( ( { unsaved } ) => {
        const next = new Set( unsaved )
        if( dirty ) next.add( id )
        else next.delete( id )
        hold_unsaved( next.size > 0 )
        return { unsaved: next }
    } ),
} ) )
