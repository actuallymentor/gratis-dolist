import { create } from 'zustand'

/**
 * UI-only state shared across components. Task data never lives here (plan §1: zustand for UI state only).
 * - update_ready: a new service worker is waiting and could not auto-activate
 * - install_prompt: the deferred `beforeinstallprompt` event, if the browser offered one
 * - unsaved: ids of components holding unsent input (drafts), which block silent auto-updates
 */
export const use_app_store = create( set => ( {
    update_ready: false,
    install_prompt: null,
    unsaved: new Set(),

    set_update_ready: update_ready => set( { update_ready } ),
    set_install_prompt: install_prompt => set( { install_prompt } ),
    mark_unsaved: ( id, dirty ) => set( ( { unsaved } ) => {
        const next = new Set( unsaved )
        if( dirty ) next.add( id )
        else next.delete( id )
        return { unsaved: next }
    } ),
} ) )
