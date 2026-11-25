import { describe, expect, it } from 'vitest'
import { create_dolist_store } from '../src/index.js'

describe( `clock skew`, () => {

    // A device that once ran an hour fast keeps minting future HLCs; peers must still take its edits
    it( `edits from a device that stamped ahead still merge`, async () => {
        let offset = 60 * 60 * 1000
        const { store, ready } = create_dolist_store( { persist: false, get_now: () => Date.now() + offset } )
        await ready
        store.setRow( `tasks`, `early`, { title: `Stamped ahead` } )
        offset = 0
        store.setRow( `tasks`, `later`, { title: `After calibration` } )

        // Another device with a correct clock receives it
        const peer = create_dolist_store( { persist: false } )
        await peer.ready
        peer.store.applyMergeableChanges( store.getMergeableContent() )
        expect( peer.store.getRow( `tasks`, `later` ) ).toEqual( { title: `After calibration` } )
        expect( peer.store.getRow( `tasks`, `early` ) ).toEqual( { title: `Stamped ahead` } )
    } )

} )
