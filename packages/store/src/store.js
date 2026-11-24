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
 * @returns {{ store: Object, ready: Promise<Object>, persister: Object|null, flush: Function, on_save_error: Function, destroy: Function }}
 *   - ready resolves with the store after load + migration; rejects when IndexedDB could not be read
 *     (autosave never starts then, so nothing on disk is touched)
 *   - flush() resolves once queued saves hit IDB; rejects if any save since the last flush failed
 *   - on_save_error( cb ) calls cb( error ) on every failed save; returns an unsubscribe function
 */
export const create_dolist_store = ( { name = `dolist`, persist = true, get_now = Date.now } = {} ) => {

    const store = createMergeableStore( undefined, get_now )
    set_clock( store, get_now )

    // Memory only: just migrate
    if( !persist ) {
        migrate( store )
        return { store, ready: Promise.resolve( store ), persister: null, flush: async () => {}, on_save_error: () => () => {}, destroy: async () => drop_view( store ) }
    }

    // Save failures: listeners hear each one, the next flush() reports all of them
    const save_error_listeners = new Set()
    const unreported_errors = []
    const report_save_error = error => {
        unreported_errors.push( error )
        save_error_listeners.forEach( listener => listener( error ) )
    }
    const on_save_error = listener => {
        save_error_listeners.add( listener )
        return () => save_error_listeners.delete( listener )
    }

    const { persister, close, load_error } = create_idb_persister( store, name, { on_save_error: report_save_error } )
    const synchronizer = createBroadcastChannelSynchronizer( store, `${ name }:tabs` )

    // load → autosave (skips the initial full save) → migrate (saved incrementally) → join tabs.
    // TinyBase swallows load errors; autosaving a store that failed to load would overwrite disk.
    const boot = async () => {
        await persister.load()
        const error = load_error()
        if( error ) throw new Error( `Could not read local data from IndexedDB "${ name }": ${ error?.message ?? error }`, { cause: error } )
        await persister.startAutoSave()
        migrate( store )
        await synchronizer.startSync()
        return store
    }
    const ready = boot()

    // Durable ack: autosave flips status to Saving synchronously per transaction, Idle once IDB commits.
    // Every flush waiting on the same Idle gets the same verdict.
    const waiting = []
    const settle = () => {
        const errors = unreported_errors.splice( 0 )
        const failure = errors.length && new Error( `${ errors.length } save(s) to IndexedDB failed: ${ errors.at( -1 )?.message ?? errors.at( -1 ) }`, { cause: errors.at( -1 ) } )
        waiting.splice( 0 ).forEach( ( { resolve, reject } ) => failure ? reject( failure ) : resolve() )
    }
    persister.addStatusListener( ( _, status ) => {
        if( status === IDLE && waiting.length ) settle()
    } )
    const flush = () => new Promise( ( resolve, reject ) => {
        waiting.push( { resolve, reject } )
        if( persister.getStatus() === IDLE ) settle()
    } )

    const destroy = async () => {
        await ready.catch( () => {} )
        await flush().catch( () => {} )
        synchronizer.destroy()
        persister.destroy()
        drop_view( store )
        await close()
    }

    return { store, ready, persister, flush, on_save_error, destroy }
}
