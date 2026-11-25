import { describe, expect, it } from 'vitest'
import { parse_quick_add, resolve_time_phrase } from '../src/index.js'

// Tuesday
const today = `2026-11-24`
const options = {
    today,
    projects: [ `Errands`, `Two words`, { id: `w`, name: `Work` }, { id: `c`, name: `Clients`, parent_id: `w` } ],
    labels: [ `call`, `after work` ],
    field_defs: [ `energy`, { name: `points`, type: `number` } ],
}
const parse = ( text, extra ) => parse_quick_add( text, { ...options, ...extra } )
const task_of = ( text, extra ) => parse( text, extra ).task

describe( `dates (§2.4 contract table)`, () => {

    it.each( [
        [ `today`, today ],
        [ `tomorrow`, `2026-11-25` ],
        [ `tmr`, `2026-11-25` ],
        [ `tom`, `2026-11-25` ],
        [ `fri`, `2026-11-27` ],
        [ `friday`, `2026-11-27` ],
        [ `tue`, `2026-12-01` ],
        [ `next fri`, `2026-12-04` ],
        [ `next week`, `2026-11-30` ],
        [ `next month`, `2026-12-01` ],
        [ `in 3 days`, `2026-11-27` ],
        [ `in 2 weeks`, `2026-12-08` ],
        [ `in a month`, `2026-12-24` ],
        [ `12 nov`, `2027-11-12` ],
        [ `nov 12th`, `2027-11-12` ],
        [ `1 dec`, `2026-12-01` ],
        [ `24 nov`, today ],
        [ `29 feb`, `2028-02-29` ],
        [ `3 jan 2027`, `2027-01-03` ],
        [ `2026-12-01`, `2026-12-01` ],
        [ `on sun`, `2026-11-29` ],
        [ `this weekend`, `2026-11-28` ],
    ] )( `"Task %s" → %s`, ( phrase, expected ) => {
        const { task } = parse( `Task ${ phrase }` )
        expect( task.scheduled ).toBe( expected )
        expect( task.title ).toBe( `Task` )
    } )

    it( `fri on a Friday means next week`, () => expect( task_of( `Call fri`, { today: `2026-11-27` } ).scheduled ).toBe( `2026-12-04` ) )

    it( `respects the week start`, () => expect( task_of( `Plan next week`, { week_start: 0 } ).scheduled ).toBe( `2026-11-29` ) )

    it( `by = inclusive deadline, before = the day before`, () => {
        expect( task_of( `Report by fri` ) ).toMatchObject( { title: `Report`, deadline: `2026-11-27`, scheduled: null } )
        expect( task_of( `Report before fri` ).deadline ).toBe( `2026-11-26` )
        expect( task_of( `Report by 1 dec` ).deadline ).toBe( `2026-12-01` )
    } )

    it( `past time today → tomorrow, future time → today`, () => {
        expect( task_of( `Call at 3pm`, { now: `16:00` } ) ).toMatchObject( { scheduled: `2026-11-25`, time: `15:00`, title: `Call` } )
        expect( task_of( `Call at 3pm`, { now: `10:00` } ).scheduled ).toBe( today )
        expect( task_of( `Call today at 3pm`, { now: `16:00` } ).scheduled ).toBe( today )
    } )

    it( `reads times`, () => {
        expect( task_of( `x at 15:00` ).time ).toBe( `15:00` )
        expect( task_of( `x 3:30pm` ).time ).toBe( `15:30` )
        expect( task_of( `x at noon` ).time ).toBe( `12:00` )
        expect( resolve_time_phrase( `12am` ) ).toBe( `00:00` )
        expect( resolve_time_phrase( `13pm` ) ).toBe( null )
    } )

    it( `reads bare hours after "at" (1–6 = afternoon, leading zero = as written)`, () => {
        expect( task_of( `x at 18` ).time ).toBe( `18:00` )
        expect( task_of( `x at 09` ).time ).toBe( `09:00` )
        expect( task_of( `x at 5` ).time ).toBe( `17:00` )
        expect( task_of( `x at 05` ).time ).toBe( `05:00` )
        expect( task_of( `x at 7` ).time ).toBe( `07:00` )
        expect( task_of( `x at 24` ) ).toMatchObject( { time: null, title: `x at 24` } )
        expect( task_of( `buy 5 apples` ).title ).toBe( `buy 5 apples` )
    } )

    it( `reads everyday shorthand combos`, () => {
        expect( task_of( `Call tom at 5` ) ).toMatchObject( { title: `Call`, scheduled: `2026-11-25`, time: `17:00` } )
        expect( task_of( `Gym fri at 18` ) ).toMatchObject( { title: `Gym`, scheduled: `2026-11-27`, time: `18:00` } )
        expect( task_of( `Standup every mon at 09` ) ).toMatchObject( { title: `Standup`, scheduled: `2026-11-30`, time: `09:00`, recur: { freq: `week`, by_day: [ 1 ] } } )
    } )

    it( `capitalised Tom is a name, not tomorrow`, () => {
        expect( task_of( `Call Tom at 5`, { now: `10:00` } ) ).toMatchObject( { title: `Call Tom`, scheduled: today, time: `17:00` } )
        expect( task_of( `Lunch by Tom` ) ).toMatchObject( { title: `Lunch by Tom`, deadline: null } )
    } )

    it( `repeated tokens: last wins, all flagged`, () => {
        const { task, spans } = parse( `Call tomorrow fri` )
        expect( task.scheduled ).toBe( `2026-11-27` )
        expect( spans.filter( span => span.type === `date` ).every( span => span.conflict ) ).toBe( true )
    } )

    it( `leaves look-alikes alone`, () => {
        ;[
            `Buy sun cream`, `Sat exam results`, `Wed anniversary gift`, `May the force`, `Women's march`,
            `Stand by me`, `Meet at 5 shops`, `Fix monitor`, `Sunscreen`, `Pay monthly bill`, `1/2 cup sugar`,
            `Weekend trip ideas`, `Read 12/11 notes`, `Since 3 Jan 2009`,
        ].forEach( title => expect( parse( title ).spans, title ).toEqual( [] ) )
    } )

} )

describe( `priority, projects, labels, fields`, () => {

    it( `!1–!4 and p1–p4, whole token only`, () => {
        expect( task_of( `Ship !1` ).priority ).toBe( 1 )
        expect( task_of( `Ship P2` ).priority ).toBe( 2 )
        expect( task_of( `Wow!1 great` ) ).toMatchObject( { priority: null, title: `Wow!1 great` } )
        expect( task_of( `Urgent !!!!` ) ).toMatchObject( { priority: null, title: `Urgent !!!!` } )
        expect( task_of( `Ship !5` ).priority ).toBe( null )
    } )

    it( `matches projects by name, quoted name and Parent/Child path`, () => {
        expect( task_of( `x #errands` ).project ).toBe( `Errands` )
        expect( task_of( `x #"Two words"` ) ).toMatchObject( { project: `Two words`, title: `x` } )
        expect( task_of( `x #two-words` ).project ).toBe( `Two words` )
        expect( task_of( `x #Work/Clients` ).project ).toBe( `Clients` )
        expect( task_of( `Buy milk #Errands.` ).project ).toBe( `Errands` )
    } )

    it( `unknown #project / @label → unknown span, removed from title`, () => {
        const { task, spans } = parse( `Fix bug #Garden @someday` )
        expect( task ).toMatchObject( { title: `Fix bug`, project: null, labels: [] } )
        expect( spans.map( ( { type, value, unknown } ) => [ type, value, unknown ] ) ).toEqual( [ [ `project`, `Garden`, true ], [ `label`, `someday`, true ] ] )
    } )

    it( `keeps issue refs, emails and handles`, () => {
        expect( task_of( `Fix #123 crash` ).title ).toBe( `Fix #123 crash` )
        expect( task_of( `Mail ada@example.com` ).title ).toBe( `Mail ada@example.com` )
        expect( task_of( `Thank (@ada) for review` ).title ).toBe( `Thank (@ada) for review` )
        expect( task_of( `Learn C# basics` ).title ).toBe( `Learn C# basics` )
    } )

    it( `labels: known, quoted, deduplicated`, () => {
        expect( task_of( `x @call @"after work" @Call` ).labels ).toEqual( [ `call`, `after work` ] )
    } )

    it( `field:value only for defined fields`, () => {
        expect( task_of( `x energy:high points:3` ) ).toMatchObject( { title: `x`, fields: { energy: `high`, points: 3 } } )
        expect( task_of( `Note: buy milk mood:ok` ).title ).toBe( `Note: buy milk mood:ok` )
    } )

} )

describe( `literals and masking`, () => {

    it( `quotes protect grammar and drop; plain quotes stay`, () => {
        const { task, spans } = parse( `Read "by friday" book by fri` )
        expect( task ).toMatchObject( { title: `Read by friday book`, deadline: `2026-11-27`, literal_mask: [ [ 5, 14 ] ] } )
        expect( spans[ 0 ] ).toMatchObject( { type: `literal`, start: 5, end: 16 } )
        expect( task_of( `Watch "The Office" tomorrow` ).title ).toBe( `Watch "The Office"` )
        expect( task_of( `Buy 12" monitor` ).title ).toBe( `Buy 12" monitor` )
    } )

    it( `quotes claim before project, label, date and priority rules`, () => {
        const nothing = { project: null, labels: [], scheduled: null, deadline: null, priority: null }
        expect( task_of( `Read "call #home today"` ) ).toMatchObject( { ...nothing, title: `Read call #home today` } )
        expect( task_of( `Read "by fri @calls" book` ) ).toMatchObject( { ...nothing, title: `Read by fri @calls book` } )
        expect( task_of( `Read "ask @Bob tomorrow"`, { labels: [ `Bob` ] } ) ).toMatchObject( { ...nothing, title: `Read ask @Bob tomorrow` } )
        expect( task_of( `Read "#Errands p1" today` ) ).toMatchObject( { title: `Read #Errands p1`, project: null, priority: null, scheduled: today } )
        expect( parse( `Read "call #home today"` ).spans.map( ( { type } ) => type ) ).toEqual( [ `literal` ] )
    } )

    it( `handles curly and unclosed quotes`, () => {
        expect( task_of( `Sing “every day” song` ).title ).toBe( `Sing every day song` )
        expect( task_of( `Sing "every day` ) ).toMatchObject( { title: `Sing every day`, recur: null } )
    } )

    it( `masks URLs, markdown links and emails`, () => {
        expect( task_of( `Read https://x.com/a#b?by=fri&p1 tomorrow` ) ).toMatchObject( { title: `Read https://x.com/a#b?by=fri&p1`, scheduled: `2026-11-25` } )
        expect( task_of( `[Pay tomorrow !1](https://bank.example/pay) p2` ) ).toMatchObject( { title: `[Pay tomorrow !1](https://bank.example/pay)`, priority: 2, scheduled: null } )
        expect( task_of( `See www.example.com/today` ).title ).toBe( `See www.example.com/today` )
    } )

    it( `literal_ranges keep ranges verbatim ("Keep as title") and round-trip via literal_mask`, () => {
        const text = `Plan next week offsite tomorrow`
        const { task } = parse( text, { literal_ranges: [ [ 5, 14 ] ] } )
        expect( task ).toMatchObject( { title: `Plan next week offsite`, scheduled: `2026-11-25`, literal_mask: [ [ 5, 14 ] ] } )
        expect( task_of( task.title, { literal_ranges: task.literal_mask } ) ).toMatchObject( { title: task.title, scheduled: null } )
    } )

    it( `spans carry positions and raw text`, () => {
        const text = `Call mum tomorrow at 3pm !2 #Errands @call`
        const { spans } = parse( text )
        spans.forEach( span => expect( text.slice( span.start, span.end ) ).toBe( span.raw ) )
        expect( spans.map( ( { type } ) => type ) ).toEqual( [ `date`, `time`, `priority`, `project`, `label` ] )
    } )

    it( `never mangles whitespace it didn't touch`, () => {
        expect( task_of( `  Two  spaces  ` ).title ).toBe( `Two  spaces` )
        expect( task_of( `Call  tomorrow  mum` ).title ).toBe( `Call mum` )
    } )

} )

describe( `recurrence in quick add`, () => {

    it.each( [
        [ `every day`, { freq: `day`, interval: 1 }, today ],
        [ `every weekday`, { freq: `week`, by_day: [ 1, 2, 3, 4, 5 ] }, today ],
        [ `every mon`, { freq: `week`, by_day: [ 1 ] }, `2026-11-30` ],
        [ `every mon and thu`, { freq: `week`, by_day: [ 1, 4 ] }, `2026-11-26` ],
        [ `every 2 weeks`, { freq: `week`, interval: 2, by_day: [ 2 ] }, today ],
        [ `every month on 31`, { freq: `month`, month_day: 31 }, `2026-11-30` ],
        [ `every month`, { freq: `month`, month_day: 24 }, today ],
        [ `every year`, { freq: `year`, month: 11, month_day: 24 }, today ],
        [ `every 1st sat`, { freq: `month`, nth: { n: 1, dow: 6 } }, `2026-12-05` ],
        [ `every 28 nov`, { freq: `year`, month: 11, month_day: 28 }, `2026-11-28` ],
        [ `every! 3 days`, { freq: `day`, interval: 3, anchor: `completion` }, today ],
    ] )( `%s`, ( phrase, rule, scheduled ) => {
        const { task } = parse( `Water plants ${ phrase }` )
        expect( task.title ).toBe( `Water plants` )
        expect( task.recur ).toMatchObject( { anchor: `schedule`, ...rule, raw: phrase } )
        expect( task.scheduled ).toBe( scheduled )
    } )

    it( `combines with time and explicit start`, () => {
        expect( task_of( `Standup every weekday at 9am`, { now: `10:00` } ) ).toMatchObject( { time: `09:00`, scheduled: `2026-11-25` } )
        expect( task_of( `Review every month 1 dec` ) ).toMatchObject( { scheduled: `2026-12-01`, recur: { month_day: 1 } } )
    } )

    it( `"every" without a rule stays text`, () => expect( task_of( `Every little thing` ) ).toMatchObject( { title: `Every little thing`, recur: null } ) )

} )
