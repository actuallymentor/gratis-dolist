import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { from_todoist } from '../src/index.js'

const sample = {
    projects: [
        { id: `inbox`, name: `Inbox`, inbox_project: true, parent_id: null, color: `grey` },
        { id: `p1`, name: `Work`, parent_id: null, color: `blue` },
        { id: `p2`, name: `Clients`, parent_id: `p1`, color: `red` },
        { id: `p3`, name: `Gone`, is_deleted: true },
    ],
    sections: [],
    labels: [ { id: `l1`, name: `call`, color: `green`, order: 1 } ],
    tasks: [
        { id: `t1`, content: `Plain`, description: ``, project_id: `inbox`, parent_id: null, labels: [], priority: 1, due: null, deadline: null, duration: null, added_at: `2026-01-01T10:00:00Z` },
        { id: `t2`, content: `Urgent timed`, description: `notes`, project_id: `p2`, parent_id: null, labels: [ `call` ], priority: 4,
            due: { date: `2026-11-16T10:00:00`, string: `16 Nov 10:00`, is_recurring: false, timezone: null }, deadline: { date: `2026-11-20` }, duration: { amount: 30, unit: `minute` } },
        { id: `t3`, content: `Fixed instant`, project_id: `p1`, parent_id: `t2`, labels: [], priority: 2,
            due: { date: `2026-10-09T06:00:00Z`, string: `2026-10-09 08:00`, is_recurring: false, timezone: `Europe/Amsterdam` } },
        { id: `t4`, content: `Rent`, project_id: `p1`, labels: [], priority: 3, due: { date: `2026-11-30`, string: `every month on the 31st`, is_recurring: true } },
        { id: `t5`, content: `Odd`, project_id: `p1`, labels: [], priority: 1, due: { date: `2026-11-17`, string: `every 3rd tue starting jan`, is_recurring: true } },
        { id: `t6`, content: `Birthday`, project_id: `p1`, labels: [], priority: 1, due: { date: `2026-11-28`, string: `every 28 nov`, is_recurring: true } },
    ],
    completed: [
        { id: `t7`, content: `Done`, project_id: `p1`, labels: [], priority: 1, checked: true, completed_at: `2026-11-01T09:00:00Z`, due: null },
        { id: `t2`, content: `Dup of active`, project_id: `p1`, labels: [], priority: 1, checked: true, completed_at: `2026-11-01T09:00:00Z` },
    ],
}

describe( `from_todoist`, () => {

    const { projects, labels, tasks } = from_todoist( sample )
    const by_id = Object.fromEntries( tasks.map( task => [ task.todoist_id, task ] ) )

    it( `maps projects (Inbox = no project, parents by name, deleted dropped)`, () => {
        expect( projects ).toEqual( [
            { todoist_id: `p1`, name: `Work`, color: `blue` },
            { todoist_id: `p2`, name: `Clients`, color: `red`, parent: `Work` },
        ] )
        expect( labels ).toEqual( [ { todoist_id: `l1`, name: `call` } ] )
    } )

    it( `inverts priority and maps dates, time, deadline, duration`, () => {
        expect( by_id.t1 ).toMatchObject( { title: `Plain`, priority: null, scheduled: null, time: null, labels: [], created_at: Date.parse( `2026-01-01T10:00:00Z` ) } )
        expect( by_id.t1.project ).toBeUndefined()
        expect( by_id.t2 ).toMatchObject( { priority: 1, project: `Clients`, labels: [ `call` ], scheduled: `2026-11-16`, time: `10:00`, deadline: `2026-11-20`, duration: 30, notes: `notes` } )
        expect( by_id.t3 ).toMatchObject( { priority: 3, parent_todoist_id: `t2`, scheduled: `2026-10-09`, time: `08:00`, tz: `Europe/Amsterdam` } )
    } )

    it( `parses recurrence or keeps it verbatim`, () => {
        expect( by_id.t4 ).toMatchObject( { priority: 2, recur: { freq: `month`, month_day: 31, anchor: `schedule` } } )
        expect( by_id.t5.recur ).toEqual( { raw: `every 3rd tue starting jan`, unparsed: true } )
        expect( by_id.t6.recur ).toMatchObject( { freq: `year`, month: 11, month_day: 28 } )
    } )

    it( `includes completed tasks once (active wins)`, () => {
        expect( tasks.length ).toBe( 7 )
        expect( by_id.t7.completed_at ).toBe( Date.parse( `2026-11-01T09:00:00Z` ) )
        expect( by_id.t2.completed_at ).toBe( null )
        expect( from_todoist( sample, { include_completed: false } ).tasks.length ).toBe( 6 )
    } )

} )

// Real export: private, gitignored; skipped in CI. Assertions only on shapes, never titles.
const export_path = new URL( `../../../fixtures/private/todoist-export.json`, import.meta.url )

describe.skipIf( !existsSync( export_path ) )( `from_todoist on the private export`, () => {

    const raw = JSON.parse( readFileSync( export_path, `utf8` ) )
    const { projects, labels, tasks } = from_todoist( raw )

    it( `keeps every task, project and label`, () => {
        expect( tasks.length ).toBe( raw.tasks.length + raw.completed.length )
        expect( projects.length ).toBe( raw.projects.filter( project => !project.inbox_project && !project.is_deleted ).length )
        expect( labels.length ).toBe( raw.labels.length )
    } )

    it( `understands every recurring rule in the account`, () => {
        const recurring = tasks.filter( task => task.recur )
        expect( recurring.length ).toBe( [ ...raw.tasks, ...raw.completed ].filter( task => task.due?.is_recurring ).length )
        expect( recurring.filter( task => task.recur.unparsed ).map( task => task.recur.raw ) ).toEqual( [] )
    } )

    it( `produces valid cells`, () => {
        const names = new Set( projects.map( project => project.name ) )
        tasks.forEach( task => {
            expect( [ 1, 2, 3, 4, null ] ).toContain( task.priority )
            if( task.scheduled ) expect( task.scheduled ).toMatch( /^\d{4}-\d{2}-\d{2}$/ )
            if( task.time ) expect( task.time ).toMatch( /^\d{2}:\d{2}$/ )
            if( task.project ) expect( names.has( task.project ) ).toBe( true )
        } )
    } )

} )
