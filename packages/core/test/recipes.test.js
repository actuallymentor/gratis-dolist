import { describe, expect, it } from 'vitest'
import { default_horizons_recipe, distribute, move } from '../src/index.js'

// Tuesday
const ctx = { today: `2026-11-24` }
const recipe = default_horizons_recipe()

const tasks = [
    { id: `overdue`, scheduled: `2026-11-20` },
    { id: `today`, scheduled: `2026-11-24`, priority: 1 },
    { id: `today-p3`, scheduled: `2026-11-24`, priority: 3 },
    { id: `soon-deadline`, scheduled: `2026-12-20`, deadline: `2026-11-26` },
    { id: `week`, scheduled: `2026-11-30` },
    { id: `month`, scheduled: `2026-12-10` },
    { id: `quarter`, deadline: `2027-02-01` },
    { id: `later`, scheduled: `2027-06-01` },
    { id: `undated` },
    { id: `done`, scheduled: `2026-11-24`, completed_at: 1 },
    { id: `deleted`, scheduled: `2026-11-24`, deleted_at: 1 },
]

const ids = list => list.map( ( { id } ) => id )

describe( `default_horizons_recipe + distribute`, () => {

    it( `has rolling lanes with cascade on`, () => {
        expect( recipe.cascade ).toBe( true )
        expect( recipe.lanes.map( ( { id, name } ) => `${ id }:${ name }` ) ).toEqual( [ `today:Today`, `week:This week`, `month:This month`, `quarter:This quarter` ] )
    } )

    it( `places each task once by its soonest date, overdue in Today, undated outside`, () => {
        const { lanes, outside } = distribute( tasks, recipe, ctx )
        expect( lanes.map( lane => [ lane.id, ids( lane.tasks ) ] ) ).toEqual( [
            [ `today`, [ `today`, `today-p3`, `overdue` ] ],
            [ `week`, [ `soon-deadline`, `week` ] ],
            [ `month`, [ `month` ] ],
            [ `quarter`, [ `quarter` ] ],
        ] )
        expect( ids( outside ) ).toEqual( [ `later`, `undated` ] )
    } )

    it( `reports each lane's effective window`, () => {
        const { lanes } = distribute( [], recipe, ctx )
        expect( lanes.map( ( { range } ) => range ) ).toEqual( [
            { start: null, end: `2026-11-24` },
            { start: `2026-11-25`, end: `2026-11-30` },
            { start: `2026-12-01`, end: `2026-12-23` },
            { start: `2026-12-24`, end: `2027-02-21` },
        ] )
    } )

    it( `cascade off lets a task show in every lane it fits`, () => {
        const { lanes } = distribute( [ tasks[ 1 ] ], { ...recipe, cascade: false }, ctx )
        expect( lanes.every( lane => lane.tasks.length === 1 ) ).toBe( true )
    } )

    it( `surfaces broken lane rules without crashing`, () => {
        const broken = { ...recipe, lanes: [ { id: `x`, name: `X`, query: `date:` } ] }
        const { lanes, outside } = distribute( tasks, broken, ctx )
        expect( lanes[ 0 ].error ).toBeTruthy()
        expect( outside.length ).toBe( 9 )
    } )

} )

describe( `move`, () => {

    it( `sets scheduled to the earliest date fitting the lane`, () => {
        expect( move( { id: `u` }, `today`, recipe, ctx ) ).toEqual( { patch: { scheduled: `2026-11-24` } } )
        expect( move( { id: `u` }, `week`, recipe, ctx ) ).toEqual( { patch: { scheduled: `2026-11-25` } } )
        expect( move( { id: `u` }, `month`, recipe, ctx ) ).toEqual( { patch: { scheduled: `2026-12-01` } } )
        expect( move( { id: `u` }, `quarter`, recipe, ctx ) ).toEqual( { patch: { scheduled: `2026-12-24` } } )
        expect( move( { id: `t`, scheduled: `2026-11-24` }, `week`, recipe, ctx ).patch.scheduled ).toBe( `2026-11-25` )
    } )

    it( `is a no-op when the task already fits`, () => expect( move( tasks[ 4 ], `week`, recipe, ctx ) ).toEqual( { patch: {} } ) )

    it( `refuses when the deadline pins it to an earlier lane`, () => {
        const result = move( { id: `p`, scheduled: `2026-11-24`, deadline: `2026-11-27` }, `month`, recipe, ctx )
        expect( result ).toEqual( { refused: true, reason: `Its deadline (Fri) keeps it in This week` } )
    } )

    it( `allows moving earlier than the deadline`, () => {
        expect( move( { id: `p`, deadline: `2026-12-10` }, `today`, recipe, ctx ) ).toEqual( { patch: { scheduled: `2026-11-24` } } )
    } )

    it( `moving outside clears the date unless something pins it`, () => {
        expect( move( { id: `o`, scheduled: `2026-11-30`, time: `09:00` }, `outside`, recipe, ctx ) ).toEqual( { patch: { scheduled: null, time: null } } )
        expect( move( { id: `o`, scheduled: `2026-11-30`, deadline: `2026-12-01` }, null, recipe, ctx ).refused ).toBe( true )
    } )

    it( `respects lane drop rules and unknown lanes`, () => {
        const custom = { cascade: true, lanes: [
            { id: `urgent`, name: `Urgent`, query: `!1`, drop: { set: { priority: 1 } } },
            { id: `ready`, name: `Ready`, query: `ready`, drop: `none` },
        ] }
        expect( move( { id: `x` }, `urgent`, custom, ctx ) ).toEqual( { patch: { priority: 1 } } )
        expect( move( { id: `x`, priority: 1 }, `ready`, custom, ctx ).refused ).toBe( true )
        expect( move( { id: `x` }, `nope`, custom, ctx ).refused ).toBe( true )
    } )

    it( `refuses when no date can satisfy the lane`, () => {
        const custom = { cascade: true, lanes: [ { id: `blocked`, name: `Blocked`, query: `blocked` } ] }
        expect( move( { id: `x` }, `blocked`, custom, ctx ).reason ).toMatch( /No date puts it in Blocked/ )
    } )

} )
