import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { add_task, create_dolist_store, get_tasks, import_json, update_task } from '../src/index.js'

let counter = 0
const open = []

// Fresh DB name per test; everything opened gets destroyed
const boot = async ( name ) => {
    const handle = create_dolist_store( { name } )
    open.push( handle )
    await handle.ready
    return handle
}

afterEach( async () => {
    await Promise.all( open.splice( 0 ).map( handle => handle.destroy() ) )
    vi.restoreAllMocks()
} )

describe( `IndexedDB persistence`, () => {

    it( `reloads what was written`, async () => {
        const name = `db${ counter++ }`
        const first = await boot( name )
        const id = add_task( first.store, { title: `Durable`, labels: [ `x` ] } )
        await first.destroy()

        const second = await boot( name )
        expect( get_tasks( second.store ) ).toMatchObject( [ { id, title: `Durable`, labels: [ `x` ] } ] )
        expect( second.store.getRow( `meta`, `schema` ) ).toEqual( { version: 1, min_client: 1 } )
    } )

    it( `writes only the touched row per edit`, async () => {
        const name = `db${ counter++ }`
        const { store, flush } = await boot( name )
        await import_json( store, { app: `dolist`, schema: 1, tables: { tasks: Object.fromEntries( Array.from( { length: 1_000 }, ( _, i ) => [ `t${ i }`, { title: `T${ i }` } ] ) ) } } )
        await flush()

        const put = vi.spyOn( IDBObjectStore.prototype, `put` )
        const clear = vi.spyOn( IDBObjectStore.prototype, `clear` )
        update_task( store, `t500`, { title: `edited` } )
        await flush()

        expect( put ).toHaveBeenCalledTimes( 1 )
        expect( put.mock.calls[ 0 ][ 1 ] ).toEqual( [ `tasks`, `t500` ] )
        expect( clear ).not.toHaveBeenCalled()
    } )

    it( `skips the full rewrite after loading`, async () => {
        const name = `db${ counter++ }`
        const first = await boot( name )
        add_task( first.store, { title: `A` } )
        await first.destroy()

        const clear = vi.spyOn( IDBObjectStore.prototype, `clear` )
        const second = await boot( name )
        await second.flush()
        expect( clear ).not.toHaveBeenCalled()
    } )

    it( `syncs tabs over BroadcastChannel`, async () => {
        const name = `db${ counter++ }`
        const a = await boot( name )
        const b = await boot( name )
        const id = add_task( a.store, { title: `From A` } )
        await vi.waitFor( () => expect( b.store.getCell( `tasks`, id, `title` ) ).toBe( `From A` ) )
    } )

} )
