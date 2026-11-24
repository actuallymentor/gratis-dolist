// Bulk in/out: JSON backup and Todoist import. Writes go in batches of BATCH rows,
// one transaction each with a yield between, so 10k rows never freeze the main
// thread (one setContent of 10k blocks ~4 s at 4x CPU, spike A).

import { v7 as uuid } from 'uuid'
import { SCHEMA_VERSION, split_key } from './schema.js'
import { now_of } from './clock.js'
import { add_label, find_label, to_cells, write_labels } from './ops.js'

const BATCH = 500
const yield_to_ui = () => new Promise( resolve => setTimeout( resolve ) )

// Run write() over items, BATCH per transaction
const in_batches = async ( store, items, write ) => {
    for( let start = 0; start < items.length; start += BATCH ) {
        store.transaction( () => items.slice( start, start + BATCH ).forEach( write ) )
        await yield_to_ui()
    }
}


/* ///////////////////////////////
// JSON backup
// /////////////////////////////*/

/**
 * Serializes all user data (plain tables, no merge metadata) for Settings → Export.
 * @param {Object} store
 * @returns {string} JSON
 */
export const export_json = store => {
    const { meta, ...tables } = store.getTables()
    return JSON.stringify( { app: `dolist`, schema: meta?.schema?.version ?? SCHEMA_VERSION, exported_at: now_of( store ), tables } )
}

/**
 * Upserts rows from an export_json() backup, batched. Rows replace same-id rows; other rows are kept.
 * @param {Object} store
 * @param {string|Object} json - export_json output, string or parsed
 * @returns {Promise<{ rows: number }>}
 */
export const import_json = async ( store, json ) => {

    // Boundary: user-supplied file
    const data = typeof json === `string` ? JSON.parse( json ) : json
    if( data?.app !== `dolist` || typeof data.tables !== `object` ) throw new Error( `Not a Dolist export` )
    if( data.schema > SCHEMA_VERSION ) throw new Error( `This export is from a newer Dolist, update first` )

    // Local meta stays authoritative
    const user_tables = Object.entries( data.tables ).filter( ( [ table_id ] ) => table_id !== `meta` )
    const rows = user_tables.flatMap( ( [ table_id, table_rows ] ) => Object.entries( table_rows ?? {} ).map( ( [ row_id, row ] ) => [ table_id, row_id, row ] ) )

    await in_batches( store, rows, ( [ table_id, row_id, row ] ) => store.setRow( table_id, row_id, row ) )
    return { rows: rows.length }
}


/* ///////////////////////////////
// Todoist import
// /////////////////////////////*/

// todoist_id → row id for rows imported before (makes re-import idempotent)
const todoist_index = ( store, table_id ) => {
    const index = new Map()
    store.forEachRow( table_id, row_id => {
        const todoist_id = store.getCell( table_id, row_id, `todoist_id` )
        if( todoist_id !== undefined ) index.set( `${ todoist_id }`, row_id )
    } )
    return index
}

// task_id → [ membership keys ], built once instead of a scan per task
const membership_index = store => {
    const index = new Map()
    store.forEachRow( `task_labels`, key => {
        const [ task_id ] = split_key( key )
        index.set( task_id, [ ...index.get( task_id ) ?? [], key ] )
    } )
    return index
}

// Task cells a Todoist import owns: empty upstream clears them locally on re-import
const MANAGED = [ `notes`, `project_id`, `parent_id`, `priority`, `scheduled`, `time`, `tz`, `duration`, `deadline`, `recur`, `completed_at` ]

// Upserts a row; managed cells absent from `cells` are cleared (an empty cell is an absent cell)
const upsert = ( store, table_id, id, cells, managed ) => {
    store.setPartialRow( table_id, id, cells )
    managed.filter( cell => !( cell in cells ) && store.hasCell( table_id, id, cell ) ).forEach( cell => store.delCell( table_id, id, cell ) )
}

/**
 * Imports core `from_todoist` output, batched. Idempotent: rows carry `todoist_id`, re-import updates them in place
 * and clears managed cells that are now empty upstream. References resolve by Todoist id only (same-named projects
 * stay apart); name fields like `project` / `parent` are ignored.
 *   projects: [ { todoist_id, name, color?, parent_todoist_id? } ]
 *   labels:   [ { todoist_id?, name, color? } ]
 *   tasks:    [ { todoist_id, title, project_todoist_id? (unknown = Inbox), labels? (names), parent_todoist_id?, ...task cells } ]
 * @param {Object} store
 * @param {{ projects?: Array, labels?: Array, tasks?: Array }} data
 * @returns {Promise<{ projects: number, labels: number, tasks: number, created: number, updated: number }>}
 */
export const import_todoist = async ( store, { projects = [], labels = [], tasks = [] } = {} ) => {

    const now = now_of( store )
    const project_ids = todoist_index( store, `projects` )
    const task_ids = todoist_index( store, `tasks` )
    const label_ids = todoist_index( store, `labels` )

    // Todoist id → local row id (undefined id or unknown row = none)
    const local_id = ( index, todoist_id ) => todoist_id === undefined || todoist_id === null ? undefined : index.get( `${ todoist_id }` )

    // Projects + labels are few: one transaction
    store.transaction( () => {

        // Assign ids first so parents resolve regardless of order
        projects.forEach( ( { todoist_id } ) => project_ids.set( `${ todoist_id }`, local_id( project_ids, todoist_id ) ?? uuid() ) )

        projects.forEach( ( { todoist_id, parent, parent_todoist_id, ...fields } ) => {
            const id = local_id( project_ids, todoist_id )
            const created_at = store.getCell( `projects`, id, `created_at` ) ?? now
            const parent_id = local_id( project_ids, parent_todoist_id )
            upsert( store, `projects`, id, { created_at, ...to_cells( { ...fields, parent_id } ), todoist_id: `${ todoist_id }` }, [ `parent_id` ] )
        } )

        labels.forEach( ( { todoist_id, ...fields } ) => {
            const id = label_ids.get( `${ todoist_id }` ) ?? find_label( store, fields.name ) ?? add_label( store, fields )
            store.setPartialRow( `labels`, id, { ...to_cells( fields ), ...todoist_id !== undefined && { todoist_id: `${ todoist_id }` } } )
        } )

    } )

    // Assign ids up front so subtasks resolve parents regardless of order
    const created = tasks.filter( ( { todoist_id } ) => !task_ids.has( `${ todoist_id }` ) ).length
    tasks.forEach( ( { todoist_id } ) => task_ids.set( `${ todoist_id }`, task_ids.get( `${ todoist_id }` ) ?? uuid() ) )

    // Label names → ids, creating missing labels in one go
    const label_names = [ ...new Set( tasks.flatMap( ( { labels: names = [] } ) => names ) ) ]
    const label_by_name = new Map()
    store.transaction( () => label_names.forEach( name => label_by_name.set( name, add_label( store, name ) ) ) )

    const memberships = membership_index( store )

    await in_batches( store, tasks, ( { todoist_id, project, project_todoist_id, labels: names = [], parent_todoist_id, ...fields } ) => {

        const id = task_ids.get( `${ todoist_id }` )
        const project_id = local_id( project_ids, project_todoist_id )
        const parent_id = local_id( task_ids, parent_todoist_id )
        const created_at = store.getCell( `tasks`, id, `created_at` ) ?? now

        upsert( store, `tasks`, id, { created_at, ...to_cells( { ...fields, project_id, parent_id } ), todoist_id: `${ todoist_id }` }, MANAGED )
        write_labels( store, id, names.map( name => label_by_name.get( name ) ), memberships.get( id ) ?? [] )
    } )

    return { projects: projects.length, labels: new Set( [ ...labels.map( ( { name } ) => name ), ...label_names ] ).size, tasks: tasks.length, created, updated: tasks.length - created }
}
