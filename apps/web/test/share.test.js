import { describe, expect, it } from 'vitest'
import { shared_text } from '../src/modules/share.js'

const share = query => shared_text( new URLSearchParams( query ) )

describe( `shared_text`, () => {
    it( `quotes words, keeps the link bare`, () => {
        expect( share( { title: `Read #1 tips @home`, url: `https://x.com/a#b` } ) ).toBe( `"Read #1 tips @home" https://x.com/a#b` )
    } )
    it( `drops repeats apps put in text`, () => {
        expect( share( { title: `Great post`, text: `Great post https://x.com/p`, url: `https://x.com/p` } ) ).toBe( `"Great post https://x.com/p"` )
        expect( share( { text: `same`, title: `same` } ) ).toBe( `"same"` )
    } )
    it( `nothing shared, nothing to add`, () => {
        expect( share( {} ) ).toBe( `` )
    } )
    it( `never lets a quote break out`, () => {
        expect( share( { text: `say "hi" #x` } ) ).toBe( `"say 'hi' #x"` )
    } )
} )
