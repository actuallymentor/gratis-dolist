// Incremental IndexedDB persister for a MergeableStore (spike A, spikes/sync/RESULTS.md).
// Stock createIndexedDbPersister rewrites the whole mergeable tree per save (~230 ms at 10k);
// this one keeps one IDB record per row and only touches changed rows.
//
// Records:  [ table_id, row_id ] → { c: { cell_id: [ value, hlc, hash ] }, h: row_hash }   (rows store)
//           [ '', value_id ]     → [ value, hlc, hash ]                                    (values store)
//
// Hashes are persisted so load hands TinyBase hashed MergeableContent, the fast
// setMergeableContent path (unhashed MergeableChanges load ~3x slower).

import { createCustomPersister } from 'tinybase/persisters'
import { getCellHash, getRowHash, getTableHash, getTablesHash, getValuesHash } from 'tinybase'

const ROWS = `rows`
const VALS = `values`
const MERGEABLE_STORE_ONLY = 2

// Promise wrappers around IDB's event style
const open_db = name => new Promise( ( resolve, reject ) => {
    const req = indexedDB.open( name, 1 )
    req.onupgradeneeded = () => {
        req.result.createObjectStore( ROWS )
        req.result.createObjectStore( VALS )
    }
    req.onsuccess = () => resolve( req.result )
    req.onerror = () => reject( req.error )
} )

const tx_done = tx => new Promise( ( resolve, reject ) => {
    tx.oncomplete = resolve
    tx.onerror = tx.onabort = () => reject( tx.error )
} )

const request = req => new Promise( ( resolve, reject ) => {
    req.onsuccess = () => resolve( req.result )
    req.onerror = () => reject( req.error )
} )

// Rejects with the original error, but lets `on_error` see it first (TinyBase swallows persister errors)
const reporting = ( action, on_error ) => async ( ...args ) => {
    try {
        return await action( ...args )
    } catch ( error ) {
        on_error( error )
        throw error
    }
}

const map_values = ( obj, fn ) => Object.fromEntries( Object.entries( obj ).map( ( [ key, value ] ) => [ key, fn( value, key ) ] ) )
const hashes_of = stamps => map_values( stamps, ( [ , , hash ] ) => hash )

/**
 * Creates the row-level IndexedDB persister. Use `load()` then `startAutoSave()`, never `startAutoPersisting()`.
 * @param {Object} store - MergeableStore
 * @param {string} name - IndexedDB database name
 * @param {Object} [options]
 * @param {string} [options.durability] - `strict` fsyncs each commit (survives power loss, ~1 ms)
 * @param {Function} [options.on_ignored_error]
 * @param {Function} [options.on_save_error] - called with each failed write (quota, aborted tx, ...)
 * @returns {{ persister: Object, close: Function, load_error: Function, needs_repair: Function }} close() closes the IDB
 *   connection after persister.destroy(); load_error() returns the error of the last failed load, or null;
 *   needs_repair() is true after a failed write until a save succeeds
 */
export const create_idb_persister = ( store, name, { durability = `strict`, on_ignored_error, on_save_error = () => {} } = {} ) => {

    const db_promise = open_db( name )

    // startAutoSave() always starts with a full save. Right after loading into an empty
    // store memory == disk, so that rewrite (~1 s at 4x CPU for 10k tasks) is skipped.
    let just_loaded = false

    // A full save may only replace disk once memory is known to mirror it (a load succeeded)
    let loaded = false
    let last_load_error = null

    // A failed write lost its changes; the next save rewrites everything (merged, never cleared) to repair disk
    let repair_pending = false

    // Full read → hashed MergeableContent
    const get_persisted = async () => {

        const db = await db_promise
        const tx = db.transaction( [ ROWS, VALS ] )
        const [ keys, rows, value_keys, values ] = await Promise.all( [
            request( tx.objectStore( ROWS ).getAllKeys() ),
            request( tx.objectStore( ROWS ).getAll() ),
            request( tx.objectStore( VALS ).getAllKeys() ),
            request( tx.objectStore( VALS ).getAll() ),
        ] )
        loaded = true
        last_load_error = null
        if( !keys.length && !value_keys.length ) return undefined
        just_loaded = store.getRowCount( `tasks` ) === 0

        // table_id → { row_id: [ cells, '', row_hash ] }
        const tables = {}
        keys.forEach( ( [ table_id, row_id ], i ) => {
            tables[ table_id ] ??= {}
            tables[ table_id ][ row_id ] = [ rows[ i ].c, ``, rows[ i ].h ]
        } )
        const table_stamps = map_values( tables, table_rows => [ table_rows, ``, getTableHash( hashes_of( table_rows ) ) ] )

        const value_stamps = Object.fromEntries( value_keys.map( ( [ , value_id ], i ) => [ value_id, values[ i ] ] ) )

        return [
            [ table_stamps, ``, getTablesHash( hashes_of( table_stamps ) ) ],
            [ value_stamps, ``, getValuesHash( hashes_of( value_stamps ) ) ],
        ]
    }

    // Merge changed cells into the stored row, read-modify-write inside the same tx
    const merge_row = ( object_store, key, cell_stamps ) => {
        const req = object_store.get( key )
        req.onsuccess = () => {
            const cells = req.result?.c ?? {}
            Object.entries( cell_stamps ).forEach( ( [ cell_id, [ value, hlc ] ] ) => {
                if( !cells[ cell_id ] || hlc > cells[ cell_id ][ 1 ] ) cells[ cell_id ] = [ value, hlc, getCellHash( value, hlc ) ]
            } )
            object_store.put( { c: cells, h: getRowHash( hashes_of( cells ) ) }, key )
        }
    }

    const set_persisted = async ( get_content, changes ) => {

        // Nothing changed since load, skip the full rewrite
        if( !changes && just_loaded ) {
            just_loaded = false
            return
        }
        just_loaded = false

        const db = await db_promise
        const tx = db.transaction( [ ROWS, VALS ], `readwrite`, { durability } )
        const rows = tx.objectStore( ROWS )
        const vals = tx.objectStore( VALS )

        // A repair merges the full content: disk may miss rows a failed write dropped
        const repairing = repair_pending
        if( changes && !repairing ) {

            // Incremental: unhashed [ value, hlc ] stamps of touched cells only
            Object.entries( changes[ 0 ][ 0 ] ).forEach( ( [ table_id, [ table_rows ] ] ) => {
                Object.entries( table_rows ).forEach( ( [ row_id, [ cells ] ] ) => merge_row( rows, [ table_id, row_id ], cells ) )
            } )
            Object.entries( changes[ 1 ][ 0 ] ).forEach( ( [ value_id, [ value, hlc ] ] ) => {
                vals.put( [ value, hlc, getCellHash( value, hlc ) ], [ ``, value_id ] )
            } )

        } else if( loaded && !repairing ) {

            // Full save: mergeable content already carries hashes
            const [ [ tables ], [ values ] ] = get_content()
            rows.clear()
            vals.clear()
            Object.entries( tables ).forEach( ( [ table_id, [ table_rows ] ] ) => {
                Object.entries( table_rows ).forEach( ( [ row_id, [ cells, , hash ] ] ) => rows.put( { c: cells, h: hash }, [ table_id, row_id ] ) )
            } )
            Object.entries( values ).forEach( ( [ value_id, stamp ] ) => vals.put( stamp, [ ``, value_id ] ) )

        } else {

            // Repair, or full save without a successful load: disk may hold rows memory never saw (failed read),
            // so merge cell by cell and never clear. An empty store then writes nothing.
            const [ [ tables ], [ values ] ] = get_content()
            Object.entries( tables ).forEach( ( [ table_id, [ table_rows ] ] ) => {
                Object.entries( table_rows ).forEach( ( [ row_id, [ cells ] ] ) => merge_row( rows, [ table_id, row_id ], cells ) )
            } )
            Object.entries( values ).forEach( ( [ value_id, [ value, hlc ] ] ) => vals.put( [ value, hlc, getCellHash( value, hlc ) ], [ ``, value_id ] ) )

        }

        await tx_done( tx )
        if( repairing ) repair_pending = false
    }

    // Remember load failures and report save failures before TinyBase swallows them
    const remember_load_error = error => {
        last_load_error = error
    }
    const load = reporting( get_persisted, remember_load_error )
    const save = reporting( set_persisted, error => {
        repair_pending = true
        on_save_error( error )
    } )

    // No cross-tab polling: the BroadcastChannel synchronizer covers tabs
    const persister = createCustomPersister( store, load, save, () => null, () => {}, on_ignored_error, MERGEABLE_STORE_ONLY )
    const close = async () => ( await db_promise.catch( () => null ) )?.close()
    const load_error = () => last_load_error

    const needs_repair = () => repair_pending
    return { persister, close, load_error, needs_repair }
}
