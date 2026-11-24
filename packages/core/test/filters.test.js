import { describe, expect, it } from 'vitest'
import { compile_filter, describe as describe_query } from '../src/index.js'

// Tuesday; calendar week ends Sun 29 Nov
const ctx = {
    today: `2026-11-24`,
    projects: [ { id: `w`, name: `Work` }, { id: `c`, name: `Clients`, parent_id: `w` }, { id: `h`, name: `Home` } ],
    labels: [ { id: `l1`, name: `call` } ],
}

const tasks = {
    overdue: { id: `a`, scheduled: `2026-11-20`, priority: 1, project_id: `w`, labels: [ `call` ] },
    today: { id: `b`, scheduled: `2026-11-24`, priority: 2, project_id: `c`, labels: [ `l1` ] },
    sunday: { id: `c`, scheduled: `2026-11-29`, project_id: `h`, fields: { Energy: `High` } },
    deadline: { id: `d`, deadline: `2026-12-15`, project_id: `c`, parent_id: `a` },
    later: { id: `e`, scheduled: `2027-03-01`, recur: { freq: `week` }, blocked: true },
    undated: { id: `f`, project: `Errands`, time: `09:00` },
    inbox: { id: `g` },
}

const matching = query => {
    const { fn, error } = compile_filter( query )
    if( error ) throw new Error( error )
    return Object.entries( tasks ).filter( ( [ , task ] ) => fn( task, ctx ) ).map( ( [ name ] ) => name )
}

describe( `compile_filter`, () => {

    it.each( [
        [ `date:today`, [ `overdue`, `today` ] ],
        [ `today`, [ `overdue`, `today` ] ],
        [ `date:week`, [ `overdue`, `today`, `sunday` ] ],
        [ `date:5d`, [ `overdue`, `today` ] ],
        [ `date:6d`, [ `overdue`, `today`, `sunday` ] ],
        [ `date:month`, [ `overdue`, `today`, `sunday` ] ],
        [ `date:quarter`, [ `overdue`, `today`, `sunday`, `deadline` ] ],
        [ `due:quarter`, [ `overdue`, `today`, `sunday` ] ],
        [ `deadline:30d`, [ `deadline` ] ],
        [ `date:none`, [ `undated`, `inbox` ] ],
        [ `deadline:none & date:quarter`, [ `overdue`, `today`, `sunday` ] ],
        [ `overdue`, [ `overdue` ] ],
        [ `!1 | p2`, [ `overdue`, `today` ] ],
        [ `#work`, [ `overdue` ] ],
        [ `##work`, [ `overdue`, `today`, `deadline` ] ],
        [ `#Work/Clients`, [ `today`, `deadline` ] ],
        [ `#errands`, [ `undated` ] ],
        [ `#inbox`, [ `later`, `inbox` ] ],
        [ `@call`, [ `overdue`, `today` ] ],
        [ `energy:high`, [ `sunday` ] ],
        [ `blocked`, [ `later` ] ],
        [ `ready & recurring`, [] ],
        [ `recurring`, [ `later` ] ],
        [ `sub`, [ `deadline` ] ],
        [ `has:deadline`, [ `deadline` ] ],
        [ `has:time`, [ `undated` ] ],
        [ `!(date:today | date:none)`, [ `sunday`, `deadline`, `later` ] ],
        [ `date:week !#home`, [ `overdue`, `today` ] ],
        [ `(#work | #home) & !overdue`, [ `sunday` ] ],
        [ ``, Object.keys( tasks ) ],
    ] )( `%s`, ( query, expected ) => expect( matching( query ) ).toEqual( expected ) )

    it( `uses ctx.is_blocked when given`, () => {
        const { fn } = compile_filter( `blocked` )
        expect( fn( tasks.inbox, { ...ctx, is_blocked: task => task.id === `g` } ) ).toBe( true )
    } )

    it( `honours week_start`, () => {
        const { fn } = compile_filter( `date:week` )
        expect( fn( tasks.sunday, ctx ) ).toBe( true )
        expect( fn( tasks.sunday, { ...ctx, week_start: 0 } ) ).toBe( false )
        expect( fn( { scheduled: `2026-11-28` }, { ...ctx, week_start: 0 } ) ).toBe( true )
    } )

    it.each( [
        [ `date:soon`, /isn't a period/ ],
        [ `(date:today`, /never closed/ ],
        [ `date:today )`, /Didn't expect/ ],
        [ `banana`, /can filter on/ ],
        [ `!`, /ends too early/ ],
        [ `has:wings`, /has: takes/ ],
    ] )( `reports "%s" as an error`, ( query, message ) => {
        const { fn, error } = compile_filter( query )
        expect( error ).toMatch( message )
        expect( fn( tasks.today, ctx ) ).toBe( false )
    } )

} )

describe( `describe`, () => {

    it.each( [
        [ `date:today`, `Scheduled or deadline by today` ],
        [ `due:7d & !1`, `Scheduled within the next 7 days and priority 1` ],
        [ `deadline:none`, `No deadline` ],
        [ `#work & (@call | !blocked)`, `In #work and (labelled @call or not blocked)` ],
        [ `##work`, `In #work or its subprojects` ],
        [ `!(overdue | sub)`, `Not (overdue or a subtask)` ],
        [ ``, `Everything` ],
        [ `date:nope`, `"nope" isn't a period. Use today, 7d, week, month, quarter or none` ],
    ] )( `%s → %s`, ( query, english ) => expect( describe_query( query ) ).toBe( english ) )

    it( `shows the concrete end with ctx`, () => {
        expect( describe_query( `date:week`, ctx ) ).toBe( `Scheduled or deadline by the end of the week (until Sun 29 Nov)` )
        expect( describe_query( `date:30d`, ctx ) ).toBe( `Scheduled or deadline within the next 30 days (until Wed 23 Dec)` )
    } )

} )
