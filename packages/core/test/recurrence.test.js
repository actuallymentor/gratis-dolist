import { describe, expect, it } from 'vitest'
import { complete_patch, current_occurrence, first_occurrence, next_occurrence, parse_recur } from '../src/index.js'

const rule = phrase => parse_recur( phrase )

describe( `parse_recur`, () => {

    it.each( [
        [ `every day`, { freq: `day`, interval: 1 } ],
        [ `every other week`, { freq: `week`, interval: 2 } ],
        [ `every 3 months`, { freq: `month`, interval: 3 } ],
        [ `every 2 months on the 15th`, { freq: `month`, interval: 2, month_day: 15 } ],
        [ `every month on the last day`, { freq: `month`, month_day: 31 } ],
        [ `every last fri`, { freq: `month`, nth: { n: -1, dow: 5 } } ],
        [ `every 25th`, { freq: `month`, month_day: 25 } ],
        [ `every 25`, { freq: `month`, month_day: 25 } ],
        [ `every August 6th`, { freq: `year`, month: 8, month_day: 6 } ],
        [ `every 10th Oct`, { freq: `year`, month: 10, month_day: 10 } ],
        [ `yearly`, { freq: `year` } ],
        [ `yearly October 3rd`, { freq: `year`, month: 10, month_day: 3 } ],
        [ `every Sat`, { freq: `week`, by_day: [ 6 ] } ],
        [ `every weekend`, { freq: `week`, by_day: [ 0, 6 ] } ],
        [ `every day at 9:00`, { freq: `day` } ],
        [ `every! week`, { freq: `week`, anchor: `completion` } ],
    ] )( `%s`, ( phrase, expected ) => expect( rule( phrase ) ).toMatchObject( { anchor: `schedule`, ...expected } ) )

    it.each( [ `every 3rd tue starting jan`, `every 31 feb`, `whenever`, `every`, `every 2 weeks on mon`, `monthly on mon` ] )( `keeps "%s" verbatim and flagged`, phrase => {
        expect( rule( phrase ) ).toEqual( { raw: phrase, unparsed: true } )
    } )

} )

describe( `next_occurrence`, () => {

    it.each( [
        [ `every day`, `2026-11-24`, `2026-11-25` ],
        [ `every 3 days`, `2026-11-24`, `2026-11-27` ],
        [ `every weekday`, `2026-11-27`, `2026-11-30` ],
        [ `every mon and thu`, `2026-11-23`, `2026-11-26` ],
        [ `every mon and thu`, `2026-11-26`, `2026-11-30` ],
        [ `every 2 weeks`, `2026-11-24`, `2026-12-08` ],
        [ `every month on 31`, `2026-01-31`, `2026-02-28` ],
        [ `every month on 31`, `2026-02-28`, `2026-03-31` ],
        [ `every month on 31`, `2028-01-31`, `2028-02-29` ],
        [ `every month on 31`, `2026-04-30`, `2026-05-31` ],
        [ `every 25th`, `2026-11-03`, `2026-11-25` ],
        [ `every 3 months`, `2026-11-04`, `2027-02-04` ],
        [ `every 1st sat`, `2026-12-05`, `2027-01-02` ],
        [ `every last fri`, `2026-11-27`, `2026-12-25` ],
        [ `every 29 feb`, `2028-02-29`, `2029-02-28` ],
        [ `every year`, `2026-11-24`, `2027-11-24` ],
        [ `every day`, `2026-03-28`, `2026-03-29` ],
    ] )( `%s after %s → %s`, ( phrase, from, expected ) => expect( next_occurrence( rule( phrase ), from ) ).toBe( expected ) )

    it( `returns null for unparsed rules`, () => expect( next_occurrence( { raw: `?`, unparsed: true }, `2026-11-24` ) ).toBe( null ) )

    it( `first_occurrence starts on or after a day`, () => {
        expect( first_occurrence( rule( `every mon` ), `2026-11-30` ) ).toBe( `2026-11-30` )
        expect( first_occurrence( rule( `every 25th` ), `2026-11-26` ) ).toBe( `2026-12-25` )
        expect( first_occurrence( rule( `every 3 days` ), `2026-11-24` ) ).toBe( `2026-11-24` )
    } )

} )

describe( `occurrences and completion`, () => {

    const today = `2026-11-24`
    const daily = { id: `t1`, scheduled: `2026-11-20`, recur: rule( `every day` ) }

    it( `current occurrence skips completed ones (idempotent per occurrence)`, () => {
        expect( current_occurrence( daily, [], today ) ).toBe( `2026-11-20` )
        expect( current_occurrence( daily, [ `2026-11-20`, { occurrence: `2026-11-21` } ], today ) ).toBe( `2026-11-22` )
        expect( current_occurrence( { recur: rule( `every mon` ) }, [], today ) ).toBe( `2026-11-30` )
        expect( current_occurrence( { scheduled: `2026-12-01` }, [], today ) ).toBe( `2026-12-01` )
    } )

    it( `schedule anchor: no pile-up, never lands in the past`, () => {
        const { patch, completion } = complete_patch( daily, `2026-11-20`, today )
        expect( patch ).toEqual( { scheduled: today } )
        expect( completion ).toMatchObject( { key: `t1:2026-11-20`, occurrence: `2026-11-20`, skipped: false } )
    } )

    it( `two devices completing the same occurrence write the same thing`, () => {
        expect( complete_patch( daily, `2026-11-20`, today ) ).toEqual( complete_patch( daily, `2026-11-20`, today ) )
    } )

    it( `completing early steps from the occurrence`, () => {
        const weekly = { id: `w`, scheduled: `2026-11-30`, recur: rule( `every mon` ) }
        expect( complete_patch( weekly, `2026-11-30`, today ).patch ).toEqual( { scheduled: `2026-12-07` } )
    } )

    it( `completion anchor (every!) counts from today`, () => {
        const task = { id: `c`, scheduled: `2026-11-10`, recur: rule( `every! 3 days` ) }
        expect( complete_patch( task, `2026-11-10`, today ).patch ).toEqual( { scheduled: `2026-11-27` } )
        const monthly = { id: `m`, scheduled: `2026-10-31`, recur: rule( `every! month` ) }
        expect( complete_patch( monthly, `2026-10-31`, today ).patch ).toEqual( { scheduled: `2026-12-24` } )
    } )

    it( `deadline moves by the same offset`, () => {
        const task = { id: `d`, scheduled: `2026-11-24`, deadline: `2026-11-26`, recur: rule( `every week` ) }
        expect( complete_patch( task, `2026-11-24`, today ).patch ).toEqual( { scheduled: `2026-12-01`, deadline: `2026-12-03` } )
    } )

    it( `month-end series keeps its day`, () => {
        const task = { id: `e`, scheduled: `2027-01-31`, recur: { ...rule( `every month on 31` ) } }
        const feb = complete_patch( task, `2027-01-31`, `2027-01-31` ).patch.scheduled
        expect( feb ).toBe( `2027-02-28` )
        expect( complete_patch( { ...task, scheduled: feb }, feb, feb ).patch.scheduled ).toBe( `2027-03-31` )
    } )

    it( `deadline-only series moves the deadline`, () => {
        const task = { id: `x`, deadline: `2026-11-24`, recur: rule( `every month` ) }
        expect( complete_patch( task, `2026-11-24`, today ).patch ).toEqual( { deadline: `2026-12-24` } )
    } )

    it( `skip writes a skipped completion`, () => {
        expect( complete_patch( daily, `2026-11-20`, today, { skipped: true } ).completion.skipped ).toBe( true )
    } )

    it( `non-recurring and unparsed tasks just complete`, () => {
        expect( complete_patch( { id: `n` }, null, today, { at: 123 } ) ).toEqual( { patch: { completed_at: 123 }, completion: null } )
        expect( complete_patch( { id: `u`, recur: { raw: `?`, unparsed: true } }, null, today ).patch ).toEqual( { completed_at: today } )
    } )

} )
