// Write side: pure functions over a store. Each op is one TinyBase transaction,
// so it lands as one incremental IDB write and one BroadcastChannel message.

import { v7 as uuid } from 'uuid'
import { pair_key, split_key } from './schema.js'
import { now_of } from './clock.js'
import { parse_recur } from './view.js'
import * as core from '@dolist/core'

// Fields that selectors derive; never written back as cells
const DERIVED = [ `id`, `labels`, `project`, `completions`, `deleted_at` ]

const is_empty = value => value === undefined || value === null || value === ``

// TinyBase cells are scalars: objects (recur) are stored as JSON, edited as a unit
const to_cell = value => typeof value === `object` ? JSON.stringify( value ) : value

// Plain fields → writable cells, minus derived and empty ones
export const to_cells = fields => Object.fromEntries( Object.entries( fields )
    .filter( ( [ key, value ] ) => !DERIVED.includes( key ) && !is_empty( value ) )
    .map( ( [ key, value ] ) => [ key, to_cell( value ) ] ) )

const clean_name = name => `${ name }`.trim().replace( /^[@#]/, `` )
const same_name = ( a, b ) => a.localeCompare( b, undefined, { sensitivity: `accent` } ) === 0


/* ///////////////////////////////
// Labels
// /////////////////////////////*/

/**
 * Finds a live label by name (case-insensitive), or undefined.
 * @param {Object} store
 * @param {string} name - leading `@` ignored
 * @returns {string|undefined} label id
 */
export const find_label = ( store, name ) => {
    const wanted = clean_name( name )
    return store.getRowIds( `labels` ).find( id => !store.getCell( `labels`, id, `deleted_at` ) && same_name( store.getCell( `labels`, id, `name` ) ?? ``, wanted ) )
}

/**
 * Creates a label, or returns the existing one with the same name.
 * @param {Object} store
 * @param {string|Object} fields - name, or { name, color, ... }
 * @returns {string} label id
 */
export const add_label = ( store, fields ) => {

    const { name, ...rest } = typeof fields === `string` ? { name: fields } : fields
    const existing = find_label( store, name )
    if( existing ) return existing

    const id = uuid()
    store.setRow( `labels`, id, { ...to_cells( rest ), name: clean_name( name ), created_at: now_of( store ) } )
    return id
}

// Names → label ids, creating missing labels
const label_ids_for = ( store, names ) => names.filter( name => clean_name( name ) ).map( name => add_label( store, name ) )

// Membership keys of one task; scans, fine for single edits (imports pass a prebuilt index)
export const label_keys_of = ( store, task_id ) => store.getRowIds( `task_labels` ).filter( key => split_key( key )[ 0 ] === task_id )

// Turn wanted memberships on and the rest off (off rows keep merge history)
export const write_labels = ( store, task_id, label_ids, existing_keys ) => {

    const wanted = new Set( label_ids.map( label_id => pair_key( task_id, label_id ) ) )
    const set_on = ( key, on ) => {
        if( store.getCell( `task_labels`, key, `on` ) !== on ) store.setCell( `task_labels`, key, `on`, on )
    }

    wanted.forEach( key => set_on( key, true ) )
    existing_keys.filter( key => !wanted.has( key ) ).forEach( key => set_on( key, false ) )
}

/**
 * Sets a task's labels by name, creating missing labels.
 * @param {Object} store
 * @param {string} id - task id
 * @param {Array<string>} names
 */
export const set_labels = ( store, id, names ) => store.transaction( () => {
    write_labels( store, id, label_ids_for( store, names ), label_keys_of( store, id ) )
} )


/* ///////////////////////////////
// Tasks
// /////////////////////////////*/

// Live subtasks of a task; scans, fine for single edits
const children_of = ( store, id ) => store.getRowIds( `tasks` ).filter( child_id => store.getCell( `tasks`, child_id, `parent_id` ) === id && !store.getCell( `tasks`, child_id, `deleted_at` ) )

// Writes a patch: empty values clear the cell, objects become JSON
const write_cells = ( store, id, patch ) => Object.entries( patch ).forEach( ( [ cell, value ] ) => {
    if( is_empty( value ) ) store.delCell( `tasks`, id, cell )
    else store.setCell( `tasks`, id, cell, to_cell( value ) )
} )

/**
 * Adds a task.
 * @param {Object} store
 * @param {Object} fields - task cells (title required; project by `project_id`, absent = Inbox) + optional `labels` names,
 *   optional `id` for idempotent adds (same id again = same task, rewritten as open)
 * @returns {string} task id (uuid v7 unless given)
 */
export const add_task = ( store, fields ) => {

    const { labels = [], id: given_id, ...rest } = fields
    if( !`${ rest.title ?? `` }`.trim() ) throw new Error( `add_task: title is required` )

    const id = given_id ?? uuid()
    store.transaction( () => {
        store.setRow( `tasks`, id, { created_at: now_of( store ), ...to_cells( rest ) } )

        // New task has no memberships yet: skip the membership scan (keeps bulk adds linear)
        write_labels( store, id, label_ids_for( store, labels ), [] )
    } )
    return id
}

/**
 * Patches a task. Empty values (null, undefined, '') clear the cell; `labels` replaces label names.
 * Never resurrects a tombstone: use restore_task.
 * @param {Object} store
 * @param {string} id
 * @param {Object} patch
 * @returns {boolean} false when the task does not exist
 */
export const update_task = ( store, id, patch ) => {

    if( !store.hasRow( `tasks`, id ) ) return false

    const { labels } = patch
    const fields = Object.entries( patch ).filter( ( [ key ] ) => !DERIVED.includes( key ) )

    store.transaction( () => {
        write_cells( store, id, Object.fromEntries( fields ) )
        if( labels ) set_labels( store, id, labels )
    } )
    return true
}

/**
 * Tombstones a task (plan §2.2: delete = tombstone, never pruned in v1). Live subtasks are orphaned into the
 * parent's project (parent_id cleared); restore_task does not re-parent them.
 * @param {Object} store
 * @param {string} id
 */
export const delete_task = ( store, id ) => {

    if( !store.hasRow( `tasks`, id ) || store.getCell( `tasks`, id, `deleted_at` ) ) return
    const project_id = store.getCell( `tasks`, id, `project_id` )

    store.transaction( () => {
        store.setCell( `tasks`, id, `deleted_at`, now_of( store ) )
        children_of( store, id ).forEach( child_id => write_cells( store, child_id, { parent_id: null, project_id } ) )
    } )
}

/**
 * Clears a task's tombstone.
 * @param {Object} store
 * @param {string} id
 */
export const restore_task = ( store, id ) => {
    if( store.hasRow( `tasks`, id ) ) store.delCell( `tasks`, id, `deleted_at` )
}


/* ///////////////////////////////
// Completion
// /////////////////////////////*/

// @dolist/core recurrence (plan §2.3). Feature-detected: active once core's index re-exports
// recurrence.js; until then completions key on the scheduled date and the task does not advance.
const recurrence = () => core.current_occurrence && core.complete_patch ? core : null

// Floating ISO date maths for undo (UTC days, no DST)
const DAY_MS = 86_400_000
const diff_days = ( later, earlier ) => ( Date.parse( later ) - Date.parse( earlier ) ) / DAY_MS
const add_days = ( iso, days ) => new Date( Date.parse( iso ) + days * DAY_MS ).toISOString().slice( 0, 10 )

const completion_keys_of = ( store, id ) => store.getRowIds( `completions` ).filter( key => split_key( key )[ 0 ] === id )

/**
 * Completes a task. Non-recurring (or an unparsed rule) → completed_at. Recurring → a `completions` row keyed
 * `task:occurrence` (idempotent: two devices completing the same occurrence offline write the same key), core's
 * complete_patch moves scheduled/deadline to the next occurrence, and completed subtasks reset for it (plan §2.3;
 * the row's `reset` cell remembers them for undo).
 * @param {Object} store
 * @param {string} id
 * @param {Object} [options]
 * @param {string} [options.today] - local ISO date
 * @param {string} [options.occurrence] - ISO date of the occurrence, default = core current_occurrence
 * @param {boolean} [options.skipped] - "Skip" instead of done
 * @returns {string|null} completed occurrence (recurring) or null
 */
export const complete_task = ( store, id, { today, occurrence, skipped = false } = {} ) => {

    if( !store.hasRow( `tasks`, id ) ) return null
    const row = store.getRow( `tasks`, id )
    const at = now_of( store )

    if( !row.recur ) {
        store.setCell( `tasks`, id, `completed_at`, at )
        return null
    }

    const task = { ...row, id, recur: parse_recur( row.recur ) }
    const done = completion_keys_of( store, id ).map( key => split_key( key )[ 1 ] )
    const lib = recurrence()
    const date = occurrence ?? lib?.current_occurrence( task, done, today ) ?? row.scheduled ?? today

    // Core treats an unparsed rule as a one-off: its patch is { completed_at }, no completion row.
    // Empty patch values (no next occurrence) leave cells alone
    const { patch = {}, completion } = lib?.complete_patch( task, date, today, { skipped, at } ) ?? { completion: true }
    if( !completion ) {
        store.transaction( () => write_cells( store, id, to_cells( patch ) ) )
        return null
    }

    // Already completed on this or another device: nothing to do
    const key = pair_key( id, date )
    if( store.hasRow( `completions`, key ) ) return date

    // Subtasks reset per occurrence: child id → its completed_at, so undo can put them back
    const reset = Object.fromEntries( children_of( store, id )
        .map( child_id => [ child_id, store.getCell( `tasks`, child_id, `completed_at` ) ] )
        .filter( ( [ , completed_at ] ) => completed_at ) )

    store.transaction( () => {
        store.setRow( `completions`, key, to_cells( { at, skipped, reset: Object.keys( reset ).length ? reset : null } ) )
        write_cells( store, id, to_cells( patch ) )
        Object.keys( reset ).forEach( child_id => store.delCell( `tasks`, child_id, `completed_at` ) )
    } )
    return date
}

/**
 * Reopens a task. Non-recurring (or completed_at set): clears completed_at. Recurring: deletes the given
 * occurrence's completion (default: most recent), moves the series back to that occurrence if it had advanced
 * past it (scheduled + deadline at the same offset, or deadline alone), and re-completes subtasks it had reset.
 * @param {Object} store
 * @param {string} id
 * @param {string} [occurrence]
 */
export const uncomplete_task = ( store, id, occurrence ) => {

    if( !store.hasRow( `tasks`, id ) ) return
    const { recur, scheduled, deadline, completed_at } = store.getRow( `tasks`, id )

    // Non-recurring or unparsed rule: just clear the stamp
    if( !recur || completed_at ) {
        store.delCell( `tasks`, id, `completed_at` )
        return
    }

    const at_of = key => store.getCell( `completions`, key, `at` )
    const [ latest ] = completion_keys_of( store, id ).sort( ( a, b ) => at_of( b ) - at_of( a ) )
    const key = occurrence ? pair_key( id, occurrence ) : latest
    if( !key || !store.hasRow( `completions`, key ) ) return

    const [ , date ] = split_key( key )
    const reset = JSON.parse( store.getCell( `completions`, key, `reset` ) ?? `{}` )

    // The series' date field (core advances scheduled, or deadline when there is no scheduled date)
    const current = scheduled ?? deadline
    const moves = !current || current <= date ? {} : {
        ...scheduled ? { scheduled: date } : { deadline: date },
        ...scheduled && deadline && { deadline: add_days( date, diff_days( deadline, scheduled ) ) },
    }

    store.transaction( () => {
        store.delRow( `completions`, key )
        write_cells( store, id, moves )

        // Put reset subtasks back, unless they were deleted or completed again since
        Object.entries( reset )
            .filter( ( [ child_id ] ) => store.hasRow( `tasks`, child_id ) && !store.getCell( `tasks`, child_id, `completed_at` ) )
            .forEach( ( [ child_id, child_completed_at ] ) => store.setCell( `tasks`, child_id, `completed_at`, child_completed_at ) )
    } )
}


/* ///////////////////////////////
// Projects
// /////////////////////////////*/

/**
 * Adds a project.
 * @param {Object} store
 * @param {string|Object} fields - name, or { name, color, parent_id, ... }
 * @returns {string} project id
 */
export const add_project = ( store, fields ) => {

    const { name, ...rest } = typeof fields === `string` ? { name: fields } : fields
    if( !clean_name( name ?? `` ) ) throw new Error( `add_project: name is required` )

    const id = uuid()
    store.setRow( `projects`, id, { ...to_cells( rest ), name: clean_name( name ), created_at: now_of( store ) } )
    return id
}

