import { describe, expect, it } from 'vitest'
import { horizon_of } from '../src/index.js'

const today = `2026-11-24`

describe( `horizon_of`, () => {

    it( `places by the soonest of either date`, () => {
        expect( horizon_of( { scheduled: `2026-12-20`, deadline: `2026-11-26` }, today ) ).toBe( `week` )
        expect( horizon_of( { scheduled: `2026-11-24` }, today ) ).toBe( `today` )
    } )

    it( `handles overdue, far future and undated`, () => {
        expect( horizon_of( { deadline: `2026-11-20` }, today ) ).toBe( `overdue` )
        expect( horizon_of( { scheduled: `2027-06-01` }, today ) ).toBe( `later` )
        expect( horizon_of( {}, today ) ).toBe( null )
    } )

} )
