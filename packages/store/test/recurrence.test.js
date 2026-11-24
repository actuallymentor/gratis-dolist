// Store ↔ @dolist/core recurrence wiring. Mocks the package with core's recurrence module
// so this runs before core's index re-exports it.
import { describe, expect, it, vi } from 'vitest'
import { add_task, complete_task, create_dolist_store, get_task, uncomplete_task } from '../src/index.js'

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

    it( `keeps unparsed rules in place`, () => {
        const store = make()
        const id = add_task( store, { title: `Odd`, recur: `every 3rd tue`, scheduled: `2026-11-24` } )
        expect( complete_task( store, id, { today: `2026-11-24` } ) ).toBe( `2026-11-24` )
        expect( get_task( store, id ) ).toMatchObject( { scheduled: `2026-11-24`, completions: [ { occurrence: `2026-11-24` } ] } )
        expect( get_task( store, id ) ).not.toHaveProperty( `completed_at` )
    } )

} )
