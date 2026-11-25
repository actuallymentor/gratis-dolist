import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMergeableStore } from 'tinybase'
import { add_task, create_dolist_store, get_tasks, import_json, update_task } from '../src/index.js'
import { create_idb_persister } from '../src/persister.js'

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

describe( `IndexedDB failures`, () => {

    // A database holding one task, closed again
    const seeded = async () => {
        const name = `db${ counter++ }`
        const first = await boot( name )
        const id = add_task( first.store, { title: `Precious` } )
        await first.destroy()
        return { name, id }
    }

    it( `a failed load rejects ready and never autosaves over disk`, async () => {
        const { name, id } = await seeded()

        const read = vi.spyOn( IDBObjectStore.prototype, `getAll` ).mockImplementation( () => {
            throw new DOMException( `boom`, `UnknownError` )
        } )
        const clear = vi.spyOn( IDBObjectStore.prototype, `clear` )
        const broken = create_dolist_store( { name } )
        open.push( broken )
        await expect( broken.ready ).rejects.toThrow( /Could not read local data.*boom/ )

        // Edits after a failed boot stay in memory only
        add_task( broken.store, { title: `Not saved` } )
        await broken.flush()
        expect( clear ).not.toHaveBeenCalled()
        await broken.destroy()

        read.mockRestore()
        const healthy = await boot( name )
        expect( get_tasks( healthy.store ).map( task => task.id ) ).toEqual( [ id ] )
    } )

    it( `a full save without a successful load merges instead of clearing`, async () => {
        const { name, id } = await seeded()

        // Raw persister, no load: startAutoSave()'s full save of an empty store
        const store = createMergeableStore()
        const { persister, close } = create_idb_persister( store, name )
        const clear = vi.spyOn( IDBObjectStore.prototype, `clear` )
        await persister.save()
        persister.destroy()
        await close()

        expect( clear ).not.toHaveBeenCalled()
        const reopened = await boot( name )
        expect( reopened.store.getCell( `tasks`, id, `title` ) ).toBe( `Precious` )
    } )

    it( `flush rejects after a failed save and on_save_error hears it`, async () => {
        const { store, flush, on_save_error } = await boot( `db${ counter++ }` )
        const heard = []
        const unsubscribe = on_save_error( error => heard.push( error.name ) )

        const quota = vi.spyOn( IDBDatabase.prototype, `transaction` ).mockImplementationOnce( () => {
            throw new DOMException( `full`, `QuotaExceededError` )
        } )
        add_task( store, { title: `Too big` } )
        await expect( flush() ).rejects.toThrow( /1 save\(s\) to IndexedDB failed: full/ )
        expect( heard ).toEqual( [ `QuotaExceededError` ] )

        // Reported once: the next healthy write flushes clean
        quota.mockRestore()
        add_task( store, { title: `Fits` } )
        await expect( flush() ).resolves.toBeUndefined()

        unsubscribe()
        expect( heard ).toHaveLength( 1 )
    } )

    it( `flush after a failure repairs even when nothing changed since`, async () => {
        const name = `db${ counter++ }`
        const { store, flush, destroy } = await boot( name )

        const quota = vi.spyOn( IDBDatabase.prototype, `transaction` ).mockImplementationOnce( () => {
            throw new DOMException( `full`, `QuotaExceededError` )
        } )
        const id = add_task( store, { title: `Retry me` } )
        await expect( flush() ).rejects.toThrow( /full/ )
        quota.mockRestore()

        // A retry that changes nothing (no change event, so no autosave): flush itself must write
        await flush()
        await destroy()
        const reopened = await boot( name )
        expect( reopened.store.getCell( `tasks`, id, `title` ) ).toBe( `Retry me` )
    } )

    it( `the save after a failure repairs what the failed write dropped`, async () => {
        const name = `db${ counter++ }`
        const { store, flush, destroy } = await boot( name )

        const quota = vi.spyOn( IDBDatabase.prototype, `transaction` ).mockImplementationOnce( () => {
            throw new DOMException( `full`, `QuotaExceededError` )
        } )
        const id = add_task( store, { title: `Lost title`, notes: `and notes` } )
        await expect( flush() ).rejects.toThrow( /full/ )
        quota.mockRestore()

        // A later edit to the same row must not leave a titleless row on disk
        update_task( store, id, { notes: `edited` } )
        await flush()
        await destroy()

        const reopened = await boot( name )
        expect( reopened.store.getRow( `tasks`, id ) ).toMatchObject( { title: `Lost title`, notes: `edited` } )
    } )

} )
