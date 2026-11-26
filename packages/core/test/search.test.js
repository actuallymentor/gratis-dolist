import { describe, expect, it } from 'vitest'
import { compile_search } from '../src/index.js'

// Tuesday
const today = `2026-11-24`
const projects = [ { id: `w`, name: `Work` }, { id: `c`, name: `Clients`, parent_id: `w` }, { id: `h`, name: `Home` } ]
const labels = [ `sensitive`, `call` ]

const tasks = [
    { id: `a`, title: `Pitch deck`, project_id: `c`, priority: 2, scheduled: `2026-11-25` },
    { id: `b`, title: `Team lunch`, project_id: `w`, deadline: `2026-11-30` },
    { id: `c`, title: `Call bank`, labels: [ `sensitive` ], priority: 1 },
    { id: `d`, title: `Taxes`, labels: [ `sensitive` ], priority: 3, deadline: `2026-12-03` },
    { id: `e`, title: `Fix fence`, project_id: `h`, scheduled: `2026-12-02`, notes: `Bring the drill` },
    { id: `f`, title: `Café visit`, labels: [ `sensitive` ], priority: 4 },
]

const find = query => tasks.filter( compile_search( query, { today, projects, labels } ).fn ).map( ( { id } ) => id )

describe( `compile_search`, () => {

    it( `#project includes subprojects; by <date> = deadline on or before`, () => {
        expect( find( `#work` ) ).toEqual( [ `a`, `b` ] )
        expect( find( `#work by next week` ) ).toEqual( [ `b` ] )
    } )

    it( `a date matches that day, a week phrase the whole week; priorities combine`, () => {
        expect( find( `tomorrow p2` ) ).toEqual( [ `a` ] )
        expect( find( `tomorrow p1` ) ).toEqual( [] )
        expect( find( `next week` ) ).toEqual( [ `b`, `d`, `e` ] )
    } )

    it( `@label + several priorities = any of them`, () => {
        expect( find( `@sensitive p1 p2 p4` ) ).toEqual( [ `c`, `f` ] )
    } )

    it( `leftover words search title and notes, accent-insensitive; unknown names match nothing`, () => {
        expect( find( `drill` ) ).toEqual( [ `e` ] )
        expect( find( `cafe` ) ).toEqual( [ `f` ] )
        expect( find( `#Nowhere` ) ).toEqual( [] )
        expect( compile_search( `  `, { today } ).empty ).toBe( true )
    } )
} )
