import { describe, expect, it } from 'vitest'
import { project_tree, triage_tasks, visible_tree } from '../src/modules/selectors.js'

const rows = [
    { id: `w`, name: `Work` },
    { id: `c`, name: `Clients`, parent_id: `w` },
    { id: `a`, name: `A`, parent_id: `b` },
    { id: `b`, name: `B`, parent_id: `a` },
]

describe( `project_tree`, () => {

    it( `nests depth-first with paths, and keeps both sides of a merged move loop`, () => {
        const tree = project_tree( rows )
        expect( tree.map( ( { path } ) => path ) ).toEqual( [ `Work`, `Work/Clients`, `A`, `A/B` ] ) // input order (rows arrive sorted by name)
    } )

} )

describe( `visible_tree`, () => {

    it( `hides the descendants of folded projects and flags parents`, () => {
        const tree = project_tree( rows.slice( 0, 2 ) )
        expect( visible_tree( tree, () => false ).map( ( { id, has_children } ) => [ id, has_children ] ) ).toEqual( [ [ `w`, true ], [ `c`, false ] ] )
        expect( visible_tree( tree, id => id === `w` ).map( ( { id } ) => id ) ).toEqual( [ `w` ] )
    } )

} )

describe( `triage_tasks`, () => {

    it( `each flag keeps only tasks lacking that field`, () => {
        const tasks = [ { id: 1, title: `a` }, { id: 2, scheduled: `2026-01-01` }, { id: 3, project_id: `w` } ]
        expect( triage_tasks( tasks, { date: true } ).map( ( { id } ) => id ) ).toEqual( [ 1, 3 ] )
        expect( triage_tasks( tasks, { date: true, project: true } ).map( ( { id } ) => id ) ).toEqual( [ 1 ] )
        expect( triage_tasks( tasks, {} ) ).toHaveLength( 3 )
    } )

} )
