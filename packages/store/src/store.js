import { createMergeableStore } from 'tinybase'
import { createBroadcastChannelSynchronizer } from 'tinybase/synchronizers/synchronizer-broadcast-channel'
import { create_idb_persister } from './persister.js'
import { migrate } from './schema.js'
import { set_clock } from './clock.js'
import { drop_view } from './view.js'

const IDLE = 0

/**
 * Creates the local-first Dolist store: MergeableStore (so M2 can attach a WsSynchronizer),
 * row-level IndexedDB persistence and BroadcastChannel multi-tab sync.
 * @param {Object} [options]
 * @param {string} [options.name] - IndexedDB name + BroadcastChannel prefix
 * @param {boolean} [options.persist] - false = memory only (tests), no tab sync either
 * @param {Function} [options.get_now] - ms clock for HLC stamps and timestamps
 * @returns {{ store: Object, ready: Promise<Object>, persister: Object|null, flush: Function, destroy: Function }}
 *   ready resolves with the store after load + migration; flush() resolves once queued saves hit IDB
 */
export const create_dolist_store = ( { name = `dolist`, persist = true, get_now = Date.now } = {} ) => {

    const store = createMergeableStore( undefined, get_now )
    set_clock( store, get_now )

    // Memory only: just migrate
    if( !persist ) {
        migrate( store )
        return { store, ready: Promise.resolve( store ), persister: null, flush: async () => {}, destroy: async () => drop_view( store ) }
    }

    const { persister, close } = create_idb_persister( store, name )
    const synchronizer = createBroadcastChannelSynchronizer( store, `${ name }:tabs` )

    // load → autosave (skips the initial full save) → migrate (saved incrementally) → join tabs
    const boot = async () => {
        await persister.load()
        await persister.startAutoSave()
        migrate( store )
        await synchronizer.startSync()
        return store
    }
    const ready = boot()

    // Durable ack: autosave flips status to Saving synchronously per transaction, Idle once IDB commits
    const flush = () => new Promise( resolve => {
        if( persister.getStatus() === IDLE ) return resolve()
        const listener_id = persister.addStatusListener( ( _, status ) => {
            if( status !== IDLE ) return
            persister.delListener( listener_id )
            resolve()
        } )
    } )

    const destroy = async () => {
        await ready.catch( () => {} )
        await flush()
        synchronizer.destroy()
        persister.destroy()
        drop_view( store )
        await close()
    }

    return { store, ready, persister, flush, destroy }
}
