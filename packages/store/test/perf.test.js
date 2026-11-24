import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { add_task, create_dolist_store, get_tasks, import_json, search_tasks, update_task } from '../src/index.js'

// Smoke budgets for a fast CI box; real budgets (plan §5) are measured in the browser
const N = 10_000
const LABELS = [ `home`, `work`, `errand`, `deep`, `call` ]

const time = fn => {
    const start = performance.now()
    const result = fn()
    return [ performance.now() - start, result ]
}

const fixture_fields = i => ( { title: `Task ${ i } café`, notes: i % 3 ? `` : `note ${ i }`, priority: i % 4 + 1, scheduled: `2026-12-${ `${ i % 28 + 1 }`.padStart( 2, `0` ) }`, labels: [ LABELS[ i % 5 ] ] } )

describe( `10k perf smoke`, () => {

    it( `adds, reads, edits and searches 10k tasks`, () => {
        const { store } = create_dolist_store( { persist: false } )

        const [ add_ms ] = time( () => store.transaction( () => Array.from( { length: N }, ( _, i ) => add_task( store, fixture_fields( i ) ) ) ) )
        const [ cold_ms, tasks ] = time( () => get_tasks( store ) )
        const [ warm_ms ] = time( () => get_tasks( store ) )
        const [ edit_ms ] = time( () => {
            update_task( store, tasks[ 42 ].id, { title: `edited` } )
            return get_tasks( store )
        } )
        const [ search_ms, hits ] = time( () => search_tasks( store, `CAFE 99` ) )

        console.info( `[perf] 10k add ${ add_ms.toFixed( 0 ) } ms | get_tasks cold ${ cold_ms.toFixed( 1 ) } / warm ${ warm_ms.toFixed( 1 ) } ms | edit+get ${ edit_ms.toFixed( 1 ) } ms | search ${ search_ms.toFixed( 1 ) } ms` )

        expect( tasks ).toHaveLength( N )
        expect( tasks[ 8 ].labels ).toEqual( [ `deep` ] )
        expect( hits.length ).toBeGreaterThan( 0 )
        expect( add_ms ).toBeLessThan( 1_500 )
        expect( cold_ms ).toBeLessThan( 500 )
        expect( warm_ms ).toBeLessThan( 50 )
        expect( edit_ms ).toBeLessThan( 50 )
        expect( search_ms ).toBeLessThan( 100 )
    } )

    it( `imports 10k into IndexedDB and reloads`, async () => {
        const name = `perf-${ Date.now() }`
        const source = create_dolist_store( { persist: false } ).store
        source.transaction( () => Array.from( { length: N }, ( _, i ) => add_task( source, fixture_fields( i ) ) ) )
        const { export_json } = await import( `../src/index.js` )
        const json = export_json( source )

        const first = create_dolist_store( { name } )
        await first.ready
        const import_start = performance.now()
        await import_json( first.store, json )
        await first.flush()
        const import_ms = performance.now() - import_start
        await first.destroy()

        const load_start = performance.now()
        const second = create_dolist_store( { name } )
        await second.ready
        const tasks = get_tasks( second.store )
        const load_ms = performance.now() - load_start
        await second.destroy()

        console.info( `[perf] 10k import→IDB ${ import_ms.toFixed( 0 ) } ms | reload+get_tasks ${ load_ms.toFixed( 0 ) } ms (fake-indexeddb)` )
        expect( tasks ).toHaveLength( N )
        expect( import_ms ).toBeLessThan( 15_000 )
        expect( load_ms ).toBeLessThan( 5_000 )
    }, 30_000 )

} )
