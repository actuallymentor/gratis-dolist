// Normalized schema (plan §2.1). TinyBase merges per cell, so anything edited
// independently gets its own cell or row. No null cells: absent cell = empty.
//
// tasks        id → title, notes, project_id (absent = Inbox), parent_id, priority, scheduled, time, tz,
//                   duration, deadline, recur (JSON), created_at, completed_at, deleted_at, literal_mask, todoist_id
// task_labels  `task:label` → on (false = removed, keeps merge history)
// completions  `task:occurrence` → at, skipped
// projects     id → name, color, parent_id, created_at, deleted_at, todoist_id
// labels       id → name, color, created_at, deleted_at, todoist_id
// meta         `schema` → version, min_client

export const SCHEMA_VERSION = 1
export const MIN_CLIENT = 1

// Separator for compound row keys; uuids never contain it
export const SEP = `:`
export const pair_key = ( a, b ) => `${ a }${ SEP }${ b }`
export const split_key = key => {
    const index = key.indexOf( SEP )
    return [ key.slice( 0, index ), key.slice( index + 1 ) ]
}

/**
 * Additive, idempotent migrations, run on every load. Unknown cells are never touched.
 * @param {Object} store
 */
export const migrate = store => {

    const version = store.getCell( `meta`, `schema`, `version` ) ?? 0
    if( version >= SCHEMA_VERSION ) return

    // v1: first run, seed meta. Future steps go here as `if( version < N ) { ... }`
    store.setRow( `meta`, `schema`, { version: SCHEMA_VERSION, min_client: MIN_CLIENT } )
}
