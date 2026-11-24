// React bindings. Hooks subscribe to the store's per-transaction change counter
// (useSyncExternalStore) and memoize selector output per version, so unrelated
// renders never recompute and a single edit rebuilds one cached task, not 10k.

import { createContext, createElement, useContext, useMemo, useSyncExternalStore } from 'react'
import { get_labels, get_projects, get_tasks, subscribe, version_of } from './view.js'

const StoreContext = createContext( null )

/**
 * Provides the TinyBase store (the `store` from create_dolist_store) to hooks below.
 * @param {Object} props
 * @param {Object} props.store
 * @param {*} props.children
 * @returns {JSX.Element}
 */
export const StoreProvider = ( { store, children } ) => createElement( StoreContext.Provider, { value: store }, children )

/**
 * The store from the nearest StoreProvider.
 * @returns {Object} store
 */
export const use_store = () => {
    const store = useContext( StoreContext )
    if( !store ) throw new Error( `use_store: wrap the tree in <StoreProvider store={ store }>` )
    return store
}

// Re-render on changes to one version key
const use_version = ( store, key ) => useSyncExternalStore(
    notify => subscribe( store, notify ),
    () => version_of( store, key ),
)

/**
 * Live task list, see get_tasks. Unchanged tasks keep identity across updates.
 * @param {Object} [options] - { include_completed, include_deleted }
 * @returns {Array<Object>}
 */
export const use_tasks = ( { include_completed = false, include_deleted = false } = {} ) => {
    const store = use_store()

    // version is the change signal; memo skips recomputing on unrelated renders
    const version = use_version( store, `tasks` )
    return useMemo( () => get_tasks( store, { include_completed, include_deleted } ), [ store, version, include_completed, include_deleted ] )
}

/**
 * Live projects sorted by name.
 * @returns {Array<Object>}
 */
export const use_projects = () => {
    const store = use_store()

    // version is the change signal; memo skips recomputing on unrelated renders
    const version = use_version( store, `projects` )
    return useMemo( () => get_projects( store ), [ store, version ] )
}

/**
 * Live labels sorted by name.
 * @returns {Array<Object>}
 */
export const use_labels = () => {
    const store = use_store()

    // version is the change signal; memo skips recomputing on unrelated renders
    const version = use_version( store, `labels` )
    return useMemo( () => get_labels( store ), [ store, version ] )
}
