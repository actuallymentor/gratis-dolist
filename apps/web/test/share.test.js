import { describe, expect, it } from 'vitest'
import { shared_task } from '../src/modules/share.js'

const share = query => shared_task( new URLSearchParams( query ) )

describe( `shared_task`, () => {

    it( `title from the share, link in notes, words stay words`, () => {
        expect( share( { title: `Read #home tomorrow !1`, url: `https://x.com/a#b` } ) ).toEqual( { title: `Read #home tomorrow !1`, notes: `https://x.com/a#b` } )
    } )

    it( `first line of text when there's no title, the rest in notes`, () => {
        expect( share( { text: `Call the bank\nby fri please` } ) ).toEqual( { title: `Call the bank`, notes: `by fri please` } )
    } )

    it( `a link repeated in text is kept once, a different link is kept too`, () => {
        expect( share( { title: `Post`, text: `Post https://x.com/p`, url: `https://x.com/p` } ) ).toEqual( { title: `Post`, notes: `Post https://x.com/p` } )
        expect( share( { url: `https://x.com/p` } ) ).toEqual( { title: `https://x.com/p`, notes: `https://x.com/p` } )
        expect( share( { title: `Post`, text: `See https://x.com/p/related`, url: `https://x.com/p` } ) ).toEqual( { title: `Post`, notes: `See https://x.com/p/related\nhttps://x.com/p` } )
    } )

    it( `a long paragraph keeps every word (shortened title, whole text in notes)`, () => {
        const long = `word `.repeat( 100 ).trim()
        const { title, notes } = share( { text: long } )
        expect( title ).toHaveLength( 300 )
        expect( notes ).toBe( long )
    } )

    it( `plain text has no added quotes; nothing shared is null`, () => {
        expect( share( { text: `Buy milk` } ) ).toEqual( { title: `Buy milk`, notes: `` } )
        expect( share( {} ) ).toBe( null )
    } )

} )
