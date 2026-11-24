import { describe, expect, it } from 'vitest'
import {
    add_label, add_project, add_task, complete_task, completed_history, create_dolist_store, delete_task,
    get_labels, get_task, get_tasks, restore_task, search_tasks, set_labels, uncomplete_task, update_task,
} from '../src/index.js'

// Memory store with a controllable clock
const make = ( start = 1_000 ) => {
    let now = start
    const { store } = create_dolist_store( { persist: false, get_now: () => now } )
    const tick = ( ms = 1 ) => {
        now += ms
    }
    return { store, tick }
}

describe( `create_dolist_store`, () => {

    it( `seeds meta idempotently`, async () => {
        const { store, ready } = create_dolist_store( { persist: false } )
        await ready
        expect( store.getRow( `meta`, `schema` ) ).toEqual( { version: 1, min_client: 1 } )
    } )

} )

describe( `tasks`, () => {

    it( `adds with uuid v7, labels and project`, () => {
        const { store } = make()
        const project_id = add_project( store, `Home` )
        const id = add_task( store, { title: `Buy milk`, project_id, labels: [ `@errand`, `shop` ], priority: 2, notes: `` } )

        expect( id ).toMatch( /^[0-9a-f]{8}-[0-9a-f]{4}-7/ )
        expect( get_task( store, id ) ).toMatchObject( { id, title: `Buy milk`, project: `Home`, project_id, priority: 2, labels: [ `errand`, `shop` ], created_at: 1_000 } )
        expect( get_task( store, id ) ).not.toHaveProperty( `notes` )
    } )

    it( `requires a title`, () => {
        const { store } = make()
        expect( () => add_task( store, { title: `  ` } ) ).toThrow( /title/ )
    } )

    it( `updates, clears cells and replaces labels`, () => {
        const { store } = make()
        const id = add_task( store, { title: `A`, labels: [ `x`, `y` ], deadline: `2026-12-01` } )
        update_task( store, id, { title: `B`, deadline: null, labels: [ `y`, `z` ] } )

        const task = get_task( store, id )
        expect( task ).toMatchObject( { title: `B`, labels: [ `y`, `z` ] } )
        expect( task ).not.toHaveProperty( `deadline` )

        // Removed membership stays as on = false for merge history
        const x = get_labels( store ).find( ( { name } ) => name === `x` ).id
        expect( store.getCell( `task_labels`, `${ id }:${ x }`, `on` ) ).toBe( false )
        expect( update_task( store, `nope`, { title: `C` } ) ).toBe( false )
    } )

    it( `reuses labels case-insensitively`, () => {
        const { store } = make()
        const id = add_label( store, `Work` )
        expect( add_label( store, `work` ) ).toBe( id )
        set_labels( store, add_task( store, { title: `t` } ), [ `WORK` ] )
        expect( get_labels( store ) ).toHaveLength( 1 )
    } )

    it( `tombstones and restores, edits never resurrect`, () => {
        const { store } = make()
        const id = add_task( store, { title: `A` } )
        delete_task( store, id )
        update_task( store, id, { title: `B`, deleted_at: null } )

        expect( get_tasks( store ) ).toHaveLength( 0 )
        expect( get_tasks( store, { include_deleted: true } )[ 0 ] ).toMatchObject( { title: `B` } )

        restore_task( store, id )
        expect( get_tasks( store ) ).toHaveLength( 1 )
    } )

    it( `falls back to Inbox when the project is deleted`, () => {
        const { store } = make()
        const project_id = add_project( store, `Gone` )
        const id = add_task( store, { title: `A`, project_id } )
        store.setCell( `projects`, project_id, `deleted_at`, 5 )
        expect( get_task( store, id ) ).toMatchObject( { project: undefined } )
        expect( get_task( store, id ) ).not.toHaveProperty( `project_id` )
    } )

    it( `keeps identity of untouched tasks across edits`, () => {
        const { store } = make()
        const a = add_task( store, { title: `A` } )
        const b = add_task( store, { title: `B` } )
        const before = get_tasks( store )
        update_task( store, a, { title: `A2` } )
        const after = get_tasks( store )

        expect( after.find( t => t.id === b ) ).toBe( before.find( t => t.id === b ) )
        expect( after.find( t => t.id === a ).title ).toBe( `A2` )
    } )

} )

describe( `completion`, () => {

    it( `completes and reopens non-recurring tasks`, () => {
        const { store, tick } = make()
        const id = add_task( store, { title: `A` } )
        tick( 10 )
        complete_task( store, id )

        expect( get_tasks( store ) ).toHaveLength( 0 )
        expect( get_tasks( store, { include_completed: true } )[ 0 ].completed_at ).toBe( 1_010 )

        uncomplete_task( store, id )
        expect( get_tasks( store ) ).toHaveLength( 1 )
    } )

    it( `writes idempotent per-occurrence completions for recurring tasks`, () => {
        const { store, tick } = make()
        const id = add_task( store, { title: `Water plants`, recur: { every: `week` }, scheduled: `2026-11-24` } )

        expect( complete_task( store, id, { today: `2026-11-24` } ) ).toBe( `2026-11-24` )
        tick()
        complete_task( store, id, { today: `2026-11-24` } )
        complete_task( store, id, { occurrence: `2026-12-01` } )

        const task = get_task( store, id )
        expect( task.recur ).toEqual( { every: `week` } )
        expect( task.completions.map( c => c.occurrence ) ).toEqual( [ `2026-11-24`, `2026-12-01` ] )
        expect( task.completions[ 0 ].at ).toBe( 1_000 )
        expect( get_tasks( store ) ).toHaveLength( 1 )

        // Undo: latest by default, or a named occurrence
        uncomplete_task( store, id )
        expect( get_task( store, id ).completions.map( c => c.occurrence ) ).toEqual( [ `2026-11-24` ] )
        uncomplete_task( store, id, `2026-11-24` )
        expect( get_task( store, id ).completions ).toEqual( [] )
    } )

    it( `keeps unparseable recurrence verbatim`, () => {
        const { store } = make()
        const id = add_task( store, { title: `t`, recur: `every 3rd tue` } )
        expect( get_task( store, id ).recur ).toEqual( { raw: `every 3rd tue`, unparsed: true } )
    } )

    it( `lists completed history newest first`, () => {
        const { store, tick } = make()
        const a = add_task( store, { title: `A` } )
        const r = add_task( store, { title: `R`, recur: { every: `day` } } )
        complete_task( store, a )
        tick()
        complete_task( store, r, { occurrence: `2026-11-24`, skipped: true } )
        tick()
        complete_task( store, r, { occurrence: `2026-11-25` } )

        const history = completed_history( store )
        expect( history.map( ( { task, occurrence } ) => [ task.title, occurrence ] ) ).toEqual( [ [ `R`, `2026-11-25` ], [ `R`, `2026-11-24` ], [ `A`, undefined ] ] )
        expect( history[ 1 ].skipped ).toBe( true )
        expect( completed_history( store, { limit: 1 } ) ).toHaveLength( 1 )
    } )

} )

describe( `search_tasks`, () => {

    it( `matches title + notes, case and diacritic insensitive`, () => {
        const { store } = make()
        add_task( store, { title: `Café with Zoë` } )
        add_task( store, { title: `Call`, notes: `ask about the CAFE menu` } )
        const gone = add_task( store, { title: `cafe deleted` } )
        delete_task( store, gone )

        expect( search_tasks( store, `cafe` ) ).toHaveLength( 2 )
        expect( search_tasks( store, `ZOE café` ).map( t => t.title ) ).toEqual( [ `Café with Zoë` ] )
        expect( search_tasks( store, `  ` ) ).toEqual( [] )
    } )

    it( `sees edits after the first search`, () => {
        const { store } = make()
        const id = add_task( store, { title: `alpha` } )
        expect( search_tasks( store, `beta` ) ).toHaveLength( 0 )
        update_task( store, id, { notes: `béta` } )
        expect( search_tasks( store, `beta` ) ).toHaveLength( 1 )
    } )

} )
