import { describe, expect, it } from 'vitest'
import { add_days, add_months, diff_days, end_of_month, end_of_quarter, end_of_week, is_iso, resolve_date_label, start_of_week, today_iso, wall_clock, weekday_of } from '../src/index.js'

describe( `date maths`, () => {

    // [ from, n, expected ] — DST weekends (EU 29 Mar / 25 Oct 2026, US 8 Mar / 1 Nov) and leap days
    it.each( [
        [ `2026-03-28`, 1, `2026-03-29` ],
        [ `2026-03-29`, 1, `2026-03-30` ],
        [ `2026-10-24`, 2, `2026-10-26` ],
        [ `2026-11-01`, 1, `2026-11-02` ],
        [ `2028-02-28`, 1, `2028-02-29` ],
        [ `2028-02-29`, 1, `2028-03-01` ],
        [ `2027-02-28`, 1, `2027-03-01` ],
        [ `2026-12-31`, 1, `2027-01-01` ],
        [ `2026-03-01`, -1, `2026-02-28` ],
    ] )( `add_days( %s, %i ) = %s`, ( from, n, expected ) => expect( add_days( from, n ) ).toBe( expected ) )

    it( `counts whole days across DST changes`, () => {
        expect( diff_days( `2026-03-30`, `2026-03-28` ) ).toBe( 2 )
        expect( diff_days( `2026-10-26`, `2026-10-24` ) ).toBe( 2 )
        expect( diff_days( `2029-01-01`, `2028-01-01` ) ).toBe( 366 )
    } )

    it.each( [
        [ `2026-01-31`, 1, `2026-02-28` ],
        [ `2028-01-31`, 1, `2028-02-29` ],
        [ `2026-03-31`, 1, `2026-04-30` ],
        [ `2026-12-15`, 1, `2027-01-15` ],
        [ `2026-01-31`, -2, `2025-11-30` ],
        [ `2028-02-29`, 12, `2029-02-28` ],
    ] )( `add_months( %s, %i ) clamps to %s`, ( from, n, expected ) => expect( add_months( from, n ) ).toBe( expected ) )

    it( `keeps a preferred day through short months`, () => {
        expect( add_months( `2026-02-28`, 1, 31 ) ).toBe( `2026-03-31` )
    } )

    it( `knows weekdays, weeks, months and quarters`, () => {
        expect( weekday_of( `2026-11-24` ) ).toBe( 2 )
        expect( start_of_week( `2026-11-24` ) ).toBe( `2026-11-23` )
        expect( start_of_week( `2026-11-24`, 0 ) ).toBe( `2026-11-22` )
        expect( end_of_week( `2026-11-29` ) ).toBe( `2026-11-29` )
        expect( end_of_week( `2026-11-29`, 0 ) ).toBe( `2026-12-05` )
        expect( end_of_month( `2028-02-03` ) ).toBe( `2028-02-29` )
        expect( end_of_quarter( `2026-11-24` ) ).toBe( `2026-12-31` )
        expect( end_of_quarter( `2026-04-01` ) ).toBe( `2026-06-30` )
    } )

    it( `validates ISO dates`, () => {
        expect( is_iso( `2028-02-29` ) ).toBe( true )
        expect( is_iso( `2027-02-29` ) ).toBe( false )
        expect( is_iso( `2026-13-01` ) ).toBe( false )
        expect( is_iso( `26-1-1` ) ).toBe( false )
    } )

    it( `reads the local date and wall clock of an instant in a zone`, () => {
        const instant = new Date( `2026-10-24T23:30:00Z` )
        expect( today_iso( instant, `Europe/Amsterdam` ) ).toBe( `2026-10-25` )
        expect( today_iso( instant, `America/New_York` ) ).toBe( `2026-10-24` )
        expect( wall_clock( new Date( `2026-10-09T06:00:00Z` ), `Europe/Amsterdam` ) ).toEqual( { date: `2026-10-09`, time: `08:00` } )
        expect( wall_clock( new Date( `2026-11-09T06:00:00Z` ), `Europe/Amsterdam` ) ).toEqual( { date: `2026-11-09`, time: `07:00` } )
    } )

} )

describe( `resolve_date_label`, () => {

    const today = `2026-11-24`

    it.each( [
        [ `2026-11-24`, `Today` ],
        [ `2026-11-25`, `Tomorrow` ],
        [ `2026-11-23`, `Yesterday` ],
        [ `2026-11-27`, `Fri` ],
        [ `2026-11-30`, `Mon` ],
        [ `2026-12-01`, `1 Dec` ],
        [ `2026-11-12`, `12 Nov` ],
        [ `2027-03-05`, `5 Mar` ],
        [ `2027-11-12`, `12 Nov 2027` ],
    ] )( `%s → %s`, ( iso, label ) => expect( resolve_date_label( iso, today ) ).toBe( label ) )

    it( `follows the locale`, () => {
        expect( resolve_date_label( `2026-11-25`, today, { locale: `nl` } ) ).toBe( `Morgen` )
        expect( resolve_date_label( `2026-12-12`, today, { locale: `en-US` } ) ).toBe( `Dec 12` )
    } )

    it( `is empty for no date`, () => expect( resolve_date_label( null, today ) ).toBe( `` ) )

} )
