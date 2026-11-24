// Read side: a lazily built, incrementally maintained cache of plain task objects per store.
// Row listeners mark only touched tasks dirty, so a keystroke-level edit rebuilds one object
// (others keep identity, React.memo friendly) instead of re-reading 10k rows.
//
// Caveat: listeners fire at transaction end, so reads *inside* a transaction see the pre-transaction view.

import { split_key } from './schema.js'

const views = new WeakMap()

// Case + diacritic insensitive form for search
export const normalize = text => `${ text ?? `` }`.normalize( `NFD` ).replace( /\p{Diacritic}/gu, `` ).toLowerCase()

/**
 * Reads a stored recur cell. JSON rules come back as objects; anything else is kept verbatim and
 * flagged like core's parse_recur does ({ raw, unparsed: true }), never dropped (plan §2.3).
 * @param {string} recur
 * @returns {Object}
 */
export const parse_recur = recur => {
    try {
        const rule = JSON.parse( recur )
        return rule && typeof rule === `object` ? rule : { raw: `${ recur }`, unparsed: true }
    } catch {
        return { raw: recur, unparsed: true }
    }
}

const by_name = ( a, b ) => a.name.localeCompare( b.name )
const is_live = ( store, table, id ) => store.hasRow( table, id ) && !store.getCell( table, id, `deleted_at` )

// Which table changes bump which version (what each hook subscribes to)
const VERSION_KEYS = { tasks: [ `tasks` ], task_labels: [ `tasks` ], completions: [ `tasks` ], projects: [ `tasks`, `projects` ], labels: [ `tasks`, `labels` ] }


/* ///////////////////////////////
// Cache lifecycle
// /////////////////////////////*/

const create_view = store => {

    const view = {
        versions: { tasks: 0, projects: 0, labels: 0 },
        touched: new Set(),
        subscribers: new Set(),
        tasks: new Map(),
        haystacks: new Map(),
        dirty: new Set(),
        stale_indexes: true,
        stale_all: true,

        // task_id → Set( label_id ) of memberships with on = true
        labels_of: new Map(),

        // task_id → Map( occurrence → completion row )
        completions_of: new Map(),
    }

    const touch = table_id => VERSION_KEYS[ table_id ].forEach( key => view.touched.add( key ) )

    // Keep the membership index in step with one task_labels row
    const index_label = key => {
        const [ task_id, label_id ] = split_key( key )
        view.dirty.add( task_id )
        if( view.stale_indexes ) return
        const set = view.labels_of.get( task_id ) ?? new Set()
        if( store.getCell( `task_labels`, key, `on` ) ) set.add( label_id )
        else set.delete( label_id )
        view.labels_of.set( task_id, set )
    }

    // Keep the completions index in step with one completions row
    const index_completion = key => {
        const [ task_id, occurrence ] = split_key( key )
        view.dirty.add( task_id )
        if( view.stale_indexes ) return
        const map = view.completions_of.get( task_id ) ?? new Map()
        if( store.hasRow( `completions`, key ) ) map.set( occurrence, store.getRow( `completions`, key ) )
        else map.delete( occurrence )
        view.completions_of.set( task_id, map )
    }

    view.listener_ids = [
        store.addRowListener( `tasks`, null, ( _, table_id, id ) => {
            touch( table_id )
            view.dirty.add( id )
        } ),
        store.addRowListener( `task_labels`, null, ( _, table_id, key ) => {
            touch( table_id )
            index_label( key )
        } ),
        store.addRowListener( `completions`, null, ( _, table_id, key ) => {
            touch( table_id )
            index_completion( key )
        } ),
        ...[ `projects`, `labels` ].map( table => store.addTableListener( table, () => {
            touch( table )
            view.stale_all = true
        } ) ),

        // Notify once per transaction, not per row
        store.addDidFinishTransactionListener( () => {
            if( !view.touched.size ) return
            view.touched.forEach( key => view.versions[ key ]++ )
            view.touched.clear()
            view.subscribers.forEach( notify => notify() )
        } ),
    ]

    views.set( store, view )
    return view
}

const view_of = store => views.get( store ) ?? create_view( store )

/**
 * Detaches the read cache from a store (called by destroy()).
 * @param {Object} store
 */
export const drop_view = store => {
    const view = views.get( store )
    if( !view ) return
    view.listener_ids.forEach( id => store.delListener( id ) )
    views.delete( store )
}

/**
 * Subscribes to read-side changes, once per finished transaction.
 * @param {Object} store
 * @param {Function} notify
 * @returns {Function} unsubscribe
 */
export const subscribe = ( store, notify ) => {
    const { subscribers } = view_of( store )
    subscribers.add( notify )
    return () => subscribers.delete( notify )
}

/**
 * Monotonic change counter for `tasks` (incl. labels/completions/project names), `projects` or `labels`.
 * @param {Object} store
 * @param {`tasks`|`projects`|`labels`} [key]
 * @returns {number}
 */
export const version_of = ( store, key = `tasks` ) => view_of( store ).versions[ key ]


/* ///////////////////////////////
// Building task objects
// /////////////////////////////*/

const rebuild_indexes = ( store, view ) => {

    view.labels_of = new Map()
    store.forEachRow( `task_labels`, key => {
        if( !store.getCell( `task_labels`, key, `on` ) ) return
        const [ task_id, label_id ] = split_key( key )
        if( !view.labels_of.has( task_id ) ) view.labels_of.set( task_id, new Set() )
        view.labels_of.get( task_id ).add( label_id )
    } )

    view.completions_of = new Map()
    store.forEachRow( `completions`, key => {
        const [ task_id, occurrence ] = split_key( key )
        if( !view.completions_of.has( task_id ) ) view.completions_of.set( task_id, new Map() )
        view.completions_of.get( task_id ).set( occurrence, store.getRow( `completions`, key ) )
    } )
}

const build_task = ( store, view, id ) => {

    const { recur, ...cells } = store.getRow( `tasks`, id )

    // Deleted labels drop memberships; deleted projects fall back to Inbox (plan §2.2)
    const label_ids = [ ...view.labels_of.get( id ) ?? [] ].filter( label_id => is_live( store, `labels`, label_id ) )
    const labels = label_ids.map( label_id => store.getCell( `labels`, label_id, `name` ) ).sort()
    const has_project = cells.project_id && is_live( store, `projects`, cells.project_id )
    if( !has_project ) delete cells.project_id
    const project = has_project ? store.getCell( `projects`, cells.project_id, `name` ) : undefined

    const task = { id, ...cells, labels, project }
    if( recur === undefined ) return task

    // Recurring: completions per occurrence, oldest first
    const completions = [ ...view.completions_of.get( id ) ?? [] ]
        .map( ( [ occurrence, row ] ) => ( { occurrence, ...row } ) )
        .sort( ( a, b ) => a.occurrence.localeCompare( b.occurrence ) )
    return { ...task, recur: parse_recur( recur ), completions }
}

// Bring the cache up to date: full rebuild once, then only dirty rows
const refresh = store => {

    const view = view_of( store )

    if( view.stale_indexes ) {
        rebuild_indexes( store, view )
        view.stale_indexes = false
        view.stale_all = true
    }

    const ids = view.stale_all ? store.getRowIds( `tasks` ) : [ ...view.dirty ]
    if( view.stale_all ) {
        view.tasks = new Map()
        view.haystacks = new Map()
    }
    view.stale_all = false
    view.dirty.clear()

    ids.forEach( id => {
        if( !store.hasRow( `tasks`, id ) ) {
            view.tasks.delete( id )
            view.haystacks.delete( id )
            return
        }
        const task = build_task( store, view, id )
        view.tasks.set( id, task )
        view.haystacks.set( id, normalize( `${ task.title ?? `` } ${ task.notes ?? `` }` ) )
    } )

    return view
}


/* ///////////////////////////////
// Selectors
// /////////////////////////////*/

const is_done = task => !!task.completed_at

/**
 * All tasks as plain objects: cells + `labels` (names) + `project` (name) + parsed `recur` and `completions` when recurring.
 * @param {Object} store
 * @param {Object} [options]
 * @param {boolean} [options.include_completed] - non-recurring tasks with completed_at
 * @param {boolean} [options.include_deleted] - tombstoned tasks
 * @returns {Array<Object>} unchanged tasks keep object identity across calls
 */
export const get_tasks = ( store, { include_completed = false, include_deleted = false } = {} ) => {
    const { tasks } = refresh( store )
    const all = [ ...tasks.values() ]
    if( include_completed && include_deleted ) return all
    return all.filter( task => ( include_deleted || !task.deleted_at ) && ( include_completed || !is_done( task ) ) )
}

/**
 * One task as a plain object, or undefined.
 * @param {Object} store
 * @param {string} id
 * @returns {Object|undefined}
 */
export const get_task = ( store, id ) => refresh( store ).tasks.get( id )

/**
 * Searches title + notes, case and diacritic insensitive; every word must match. Excludes deleted.
 * @param {Object} store
 * @param {string} query
 * @param {Object} [options]
 * @param {boolean} [options.include_completed]
 * @returns {Array<Object>}
 */
export const search_tasks = ( store, query, { include_completed = true } = {} ) => {

    const words = normalize( query ).split( /\s+/ ).filter( Boolean )
    if( !words.length ) return []

    const { tasks, haystacks } = refresh( store )
    const matches = ( id ) => words.every( word => haystacks.get( id ).includes( word ) )
    return [ ...tasks.values() ].filter( task => !task.deleted_at && ( include_completed || !is_done( task ) ) && matches( task.id ) )
}

/**
 * Completion log, newest first: non-recurring completions and per-occurrence recurring ones.
 * @param {Object} store
 * @param {Object} [options]
 * @param {number} [options.limit]
 * @returns {Array<{ task: Object, at: number, occurrence?: string, skipped?: boolean }>}
 */
export const completed_history = ( store, { limit = 100 } = {} ) => {

    const live = get_tasks( store, { include_completed: true } )
    const entries = live.flatMap( task => {
        if( task.completions ) return task.completions.map( ( { occurrence, at, skipped } ) => ( { task, at, occurrence, skipped } ) )
        return is_done( task ) ? [ { task, at: task.completed_at } ] : []
    } )

    return entries.sort( ( a, b ) => b.at - a.at ).slice( 0, limit )
}

// Projects and labels are few: build fresh
const list_rows = ( store, table, include_deleted ) => store.getRowIds( table )
    .map( id => ( { id, ...store.getRow( table, id ) } ) )
    .filter( row => include_deleted || !row.deleted_at )
    .sort( by_name )

/**
 * Projects sorted by name.
 * @param {Object} store
 * @param {Object} [options]
 * @param {boolean} [options.include_deleted]
 * @returns {Array<Object>}
 */
export const get_projects = ( store, { include_deleted = false } = {} ) => list_rows( store, `projects`, include_deleted )

/**
 * Labels sorted by name.
 * @param {Object} store
 * @param {Object} [options]
 * @param {boolean} [options.include_deleted]
 * @returns {Array<Object>}
 */
export const get_labels = ( store, { include_deleted = false } = {} ) => list_rows( store, `labels`, include_deleted )
