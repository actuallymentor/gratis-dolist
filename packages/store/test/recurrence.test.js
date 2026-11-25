// Store ↔ @dolist/core recurrence wiring. Mocks the package with core's recurrence module
// so this runs before core's index re-exports it.
import { describe, expect, it, vi } from 'vitest'
import { add_task, complete_task, completed_history, create_dolist_store, get_task, uncomplete_task } from '../src/index.js'

vi.mock( `@dolist/core`, async () => ( { ...await import( `../../core/src/recurrence.js` ) } ) )

const weekly = { freq: `week`, interval: 1, by_day: [ 2 ], anchor: `schedule`, raw: `every tue` }
const make = () => create_dolist_store( { persist: false } ).store

describe( `recurring completion via core`, () => {

    it( `completes the current occurrence and advances dates, deadline keeps its offset`, () => {
        const store = make()
        const id = add_task( store, { title: `Report`, recur: weekly, scheduled: `2026-11-24`, deadline: `2026-11-26` } )

        expect( complete_task( store, id, { today: `2026-11-24` } ) ).toBe( `2026-11-24` )
        expect( get_task( store, id ) ).toMatchObject( { scheduled: `2026-12-01`, deadline: `2026-12-03` } )
        expect( get_task( store, id ).completions.map( c => c.occurrence ) ).toEqual( [ `2026-11-24` ] )

        // Next completion targets the next occurrence
        expect( complete_task( store, id, { today: `2026-11-24` } ) ).toBe( `2026-12-01` )
    } )

    it( `is idempotent per occurrence and undo moves the task back`, () => {
        const store = make()
        const id = add_task( store, { title: `Report`, recur: weekly, scheduled: `2026-11-24`, deadline: `2026-11-26` } )
        complete_task( store, id, { today: `2026-11-24`, occurrence: `2026-11-24` } )
        complete_task( store, id, { today: `2026-11-24`, occurrence: `2026-11-24` } )
        expect( get_task( store, id ).scheduled ).toBe( `2026-12-01` )

        uncomplete_task( store, id )
        expect( get_task( store, id ) ).toMatchObject( { scheduled: `2026-11-24`, deadline: `2026-11-26`, completions: [] } )
    } )

    it( `completes unparsed rules like one-offs, undo reopens`, () => {
        const store = make()
        const id = add_task( store, { title: `Odd`, recur: `every 3rd tue`, scheduled: `2026-11-24` } )
        expect( complete_task( store, id, { today: `2026-11-24` } ) ).toBe( null )
        expect( get_task( store, id ) ).toMatchObject( { scheduled: `2026-11-24`, completed_at: expect.any( Number ) } )
        expect( store.getRowCount( `completions` ) ).toBe( 0 )

        // Still reachable from Completed after Undo expires
        expect( completed_history( store ).map( ( { task } ) => task.id ) ).toEqual( [ id ] )

        uncomplete_task( store, id )
        expect( get_task( store, id ) ).not.toHaveProperty( `completed_at` )
    } )

    it( `undo moves a deadline-only series back`, () => {
        const store = make()
        const id = add_task( store, { title: `Taxes`, recur: weekly, deadline: `2026-11-24` } )
        complete_task( store, id, { today: `2026-11-24` } )
        expect( get_task( store, id ).deadline ).toBe( `2026-12-01` )

        uncomplete_task( store, id )
        expect( get_task( store, id ) ).toMatchObject( { deadline: `2026-11-24`, completions: [] } )
        expect( get_task( store, id ) ).not.toHaveProperty( `scheduled` )
    } )

    it( `resets completed subtasks per occurrence, undo restores them`, () => {
        const store = make()
        const id = add_task( store, { title: `Clean`, recur: weekly, scheduled: `2026-11-24` } )
        const done = add_task( store, { title: `Hoover`, parent_id: id } )
        const open = add_task( store, { title: `Mop`, parent_id: id } )
        complete_task( store, done )
        const done_at = store.getCell( `tasks`, done, `completed_at` )

        complete_task( store, id, { today: `2026-11-24` } )
        expect( get_task( store, done ) ).not.toHaveProperty( `completed_at` )
        expect( get_task( store, open ) ).not.toHaveProperty( `completed_at` )

        uncomplete_task( store, id )
        expect( get_task( store, done ).completed_at ).toBe( done_at )
        expect( get_task( store, open ) ).not.toHaveProperty( `completed_at` )
    } )

} )
