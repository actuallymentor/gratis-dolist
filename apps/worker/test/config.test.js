import { readFileSync, readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { normalize_code, random_code } from '../src/codes.js'

describe( `deploy config`, () => {

    // E2E switches on cookie-selected tenants; it may only ever come from `wrangler dev --var`
    it( `no wrangler config or workflow sets the E2E var`, () => {
        const files = [ ...readdirSync( `.` ).filter( name => /^wrangler\..*json/.test( name ) ), ...readdirSync( `.github/workflows` ).map( name => `.github/workflows/${ name }` ) ]
        files.forEach( file => expect( readFileSync( file, `utf8` ), file ).not.toMatch( /\bE2E\b/ ) )
    } )

} )

describe( `codes`, () => {

    it( `are grouped, unambiguous and round-trip through sloppy typing`, () => {
        const code = random_code( 128 )
        expect( code ).toMatch( /^[A-HJKMNP-TV-Z0-9]{4}(-[A-HJKMNP-TV-Z0-9]{1,4})+$/ )
        expect( normalize_code( ` ${ code.toLowerCase().replace( /-/g, ' ' ) } ` ) ).toBe( normalize_code( code ) )
        expect( normalize_code( `o1l-I` ) ).toBe( `0111` )
    } )

} )
