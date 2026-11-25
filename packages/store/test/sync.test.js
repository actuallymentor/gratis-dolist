import { describe, expect, it, vi } from 'vitest'
import { start_sync, REVOKED } from '../src/sync.js'

// The wire protocol is TinyBase's; here only the reconnect state machine is under test
// `fail_next` makes the next startSync report an error the way TinyBase does: via onIgnoredError, then resolve
const control = vi.hoisted( () => ( { fail_next: false } ) )
vi.mock( `tinybase/synchronizers/synchronizer-ws-client`, () => ( {
    createWsSynchronizer: async ( store, socket, timeout, send, receive, on_error ) => ( {
        startSync: async () => {
            if( control.fail_next ) on_error( new Error( `timed out` ) )
            control.fail_next = false
        },
        destroy: () => {},
    } ),
} ) )

class FakeSocket extends EventTarget {
    readyState = 0
    open() {
        this.readyState = 1
        this.dispatchEvent( new Event( `open` ) )
    }
    close( code = 1006 ) {
        if( this.readyState === 3 ) return
        this.readyState = 3
        this.dispatchEvent( Object.assign( new Event( `close` ), { code } ) )
    }
}

const tick = () => new Promise( resolve => setTimeout( resolve, 0 ) )

const harness = should_retry => {
    const sockets = []
    const statuses = []
    const sync = start_sync( {}, {
        url: `ws://test`,
        should_retry,
        on_status: status => statuses.push( status ),
        create_socket: () => sockets[ sockets.push( new FakeSocket() ) - 1 ],
    } )
    return { sync, sockets, statuses }
}

describe( `start_sync`, () => {

    it( `a slow sign-in check never knocks out a newer healthy connection`, async () => {
        let answer
        const { sync, sockets, statuses } = harness( () => new Promise( resolve => answer = resolve ) )
        sockets[ 0 ].open()
        await tick()

        sync.drop()
        sync.retry_now()
        sockets[ 1 ].open()
        await tick()
        expect( statuses.at( -1 ) ).toBe( `synced` )

        // The old check resolves late, either way: the new connection stays
        answer( true )
        await tick()
        expect( statuses.at( -1 ) ).toBe( `synced` )
        expect( sockets ).toHaveLength( 2 )
        sync.stop()
    } )

    it( `nothing fires after stop`, async () => {
        let answer
        const { sync, sockets, statuses } = harness( () => new Promise( resolve => answer = resolve ) )
        sockets[ 0 ].open()
        await tick()
        sync.drop()
        sync.stop()
        const before = statuses.length
        answer( true )
        await tick()
        expect( statuses ).toHaveLength( before )
    } )

    it( `a timed-out first exchange is never reported as synced`, async () => {
        control.fail_next = true
        const { sync, sockets, statuses } = harness( async () => true )
        sockets[ 0 ].open()
        await tick()
        expect( statuses ).not.toContain( `synced` )
        expect( sockets[ 0 ].readyState ).toBe( 3 )
        expect( statuses.at( -1 ) ).toBe( `offline` )
        sync.stop()
    } )

    it( `revoked stops for good without asking`, async () => {
        const should_retry = vi.fn( async () => true )
        const { sockets, statuses } = harness( should_retry )
        sockets[ 0 ].open()
        await tick()
        sockets[ 0 ].close( REVOKED )
        await tick()
        expect( statuses.at( -1 ) ).toBe( `stopped` )
        expect( should_retry ).not.toHaveBeenCalled()
    } )

} )
