import { describe, expect, it } from 'vitest'
import { add_project, add_task, complete_task, create_dolist_store, export_json, get_labels, get_projects, get_tasks, import_json, import_todoist } from '../src/index.js'

const memory = () => create_dolist_store( { persist: false } ).store

// Canonical comparison: TinyBase key order may differ between stores
const sorted = tables => JSON.parse( JSON.stringify( tables, ( _, value ) => value && typeof value === `object` && !Array.isArray( value ) ? Object.fromEntries( Object.entries( value ).sort( ( [ a ], [ b ] ) => a.localeCompare( b ) ) ) : value ) )

// Everything but local meta
const user_tables = store => Object.fromEntries( Object.entries( store.getTables() ).filter( ( [ table_id ] ) => table_id !== `meta` ) )

describe( `export_json / import_json`, () => {

    it( `round-trips all user tables`, async () => {
        const source = memory()
        const project_id = add_project( source, `Home` )
        add_task( source, { title: `A`, project_id, labels: [ `x` ] } )
        complete_task( source, add_task( source, { title: `R`, recur: { every: `day` } } ), { occurrence: `2026-11-24` } )

        const json = export_json( source )
        const target = memory()
        expect( await import_json( target, json ) ).toEqual( { rows: 6 } )

        expect( sorted( user_tables( target ) ) ).toEqual( sorted( user_tables( source ) ) )
        expect( JSON.parse( json ) ).toMatchObject( { app: `dolist`, schema: 1 } )
    } )

    it( `rejects foreign or newer files`, async () => {
        await expect( import_json( memory(), `{"tables":{}}` ) ).rejects.toThrow( /Not a Dolist/ )
        await expect( import_json( memory(), { app: `dolist`, schema: 99, tables: {} } ) ).rejects.toThrow( /newer/ )
    } )

    it( `imports in batches with a yield between`, async () => {
        const store = memory()
        const tables = { tasks: Object.fromEntries( Array.from( { length: 1_200 }, ( _, i ) => [ `t${ i }`, { title: `T${ i }` } ] ) ) }
        let transactions = 0
        store.addDidFinishTransactionListener( () => transactions++ )
        await import_json( store, { app: `dolist`, schema: 1, tables } )
        expect( transactions ).toBe( 3 )
        expect( get_tasks( store ) ).toHaveLength( 1_200 )
    } )

} )

describe( `import_todoist`, () => {

    const todoist = {
        projects: [ { todoist_id: `p1`, name: `Work` }, { todoist_id: `p2`, name: `Reports`, parent_todoist_id: `p1`, color: `red` } ],
        labels: [ { todoist_id: `l1`, name: `deep` } ],
        tasks: [
            { todoist_id: `t2`, title: `Sub`, parent_todoist_id: `t1`, project_todoist_id: `p2` },
            { todoist_id: `t1`, title: `Q4 report`, project_todoist_id: `p2`, labels: [ `deep`, `urgent` ], priority: 1, scheduled: `2026-11-27`, deadline: `2026-11-30` },
            { todoist_id: `t3`, title: `Weird`, recur: `every 3rd tue`, project_todoist_id: `inbox` },
        ],
    }

    it( `maps todoist ids to ids, subtasks, labels, unparsed recurrence`, async () => {
        const store = memory()
        expect( await import_todoist( store, todoist ) ).toEqual( { projects: 2, labels: 2, tasks: 3, created: 3, updated: 0 } )

        const tasks = get_tasks( store )
        const by_title = Object.fromEntries( tasks.map( t => [ t.title, t ] ) )
        expect( by_title[ `Q4 report` ] ).toMatchObject( { project: `Reports`, labels: [ `deep`, `urgent` ], priority: 1, deadline: `2026-11-30`, todoist_id: `t1` } )
        expect( by_title.Sub.parent_id ).toBe( by_title[ `Q4 report` ].id )
        expect( by_title.Weird ).toMatchObject( { recur: { raw: `every 3rd tue`, unparsed: true }, project: undefined } )

        const [ reports, work ] = get_projects( store )
        expect( reports ).toMatchObject( { name: `Reports`, parent_id: work.id, color: `red` } )
    } )

    it( `is idempotent by todoist id`, async () => {
        const store = memory()
        await import_todoist( store, todoist )
        const edited = { ...todoist, tasks: todoist.tasks.map( t => t.todoist_id === `t1` ? { ...t, title: `Q4 report v2`, labels: [ `deep` ] } : t ) }
        expect( await import_todoist( store, edited ) ).toMatchObject( { created: 0, updated: 3 } )

        expect( get_tasks( store ) ).toHaveLength( 3 )
        expect( get_projects( store ) ).toHaveLength( 2 )
        expect( get_labels( store ) ).toHaveLength( 2 )
        expect( get_tasks( store ).find( t => t.todoist_id === `t1` ) ).toMatchObject( { title: `Q4 report v2`, labels: [ `deep` ] } )
    } )

    it( `keeps same-named projects apart (parents and tasks resolve by todoist id)`, async () => {
        const store = memory()
        await import_todoist( store, {
            projects: [ { todoist_id: `a`, name: `Admin` }, { todoist_id: `b`, name: `Admin` }, { todoist_id: `c`, name: `Sub`, parent_todoist_id: `b` } ],
            tasks: [ { todoist_id: `x`, title: `In B`, project_todoist_id: `b` } ],
        } )

        const by_todoist = Object.fromEntries( get_projects( store ).map( project => [ project.todoist_id, project ] ) )
        expect( by_todoist.a.id ).not.toBe( by_todoist.b.id )
        expect( by_todoist.c.parent_id ).toBe( by_todoist.b.id )
        expect( get_tasks( store )[ 0 ].project_id ).toBe( by_todoist.b.id )
    } )

    it( `re-import clears cells that are now empty upstream`, async () => {
        const store = memory()
        await import_todoist( store, todoist )

        // Upstream: Q4 report lost its dates, priority and project, Sub its parent, Reports its parent
        const bare = { todoist_id: `t1`, title: `Q4 report`, labels: [ `deep` ] }
        const flat_projects = [ { todoist_id: `p1`, name: `Work` }, { todoist_id: `p2`, name: `Reports` } ]
        await import_todoist( store, { projects: flat_projects, tasks: [ { ...bare, completed_at: 5 }, { todoist_id: `t2`, title: `Sub` } ] } )

        // Then reopened upstream
        await import_todoist( store, { tasks: [ bare ] } )

        const by_title = Object.fromEntries( get_tasks( store ).map( t => [ t.title, t ] ) )
        const cleared = [ `priority`, `scheduled`, `deadline`, `project_id`, `completed_at` ]
        cleared.forEach( cell => expect( by_title[ `Q4 report` ] ).not.toHaveProperty( cell ) )
        expect( by_title.Sub ).not.toHaveProperty( `parent_id` )
        expect( get_projects( store ).find( project => project.name === `Reports` ) ).not.toHaveProperty( `parent_id` )
    } )

} )
