// @vitest-environment happy-dom
import { act, render, renderHook } from '@testing-library/react'
import { createElement, memo } from 'react'
import { describe, expect, it } from 'vitest'
import { add_label, add_project, add_task, complete_task, create_dolist_store, update_task } from '../src/index.js'
import { StoreProvider, use_labels, use_projects, use_tasks } from '../src/react.js'

const setup = () => {
    const { store } = create_dolist_store( { persist: false } )
    const wrapper = ( { children } ) => createElement( StoreProvider, { store }, children )
    return { store, wrapper }
}

describe( `react hooks`, () => {

    it( `use_tasks re-renders on writes and honours options`, () => {
        const { store, wrapper } = setup()
        const { result } = renderHook( () => [ use_tasks(), use_tasks( { include_completed: true } ) ], { wrapper } )
        expect( result.current[ 0 ] ).toEqual( [] )

        let id
        act( () => {
            id = add_task( store, { title: `A`, labels: [ `x` ] } )
        } )
        expect( result.current[ 0 ] ).toMatchObject( [ { title: `A`, labels: [ `x` ] } ] )

        act( () => complete_task( store, id ) )
        expect( result.current[ 0 ] ).toEqual( [] )
        expect( result.current[ 1 ] ).toHaveLength( 1 )
    } )

    it( `use_projects / use_labels track their tables`, () => {
        const { store, wrapper } = setup()
        const { result } = renderHook( () => ( { projects: use_projects(), labels: use_labels() } ), { wrapper } )
        act( () => {
            add_project( store, `Home` )
            add_label( store, `errand` )
        } )
        expect( result.current.projects.map( p => p.name ) ).toEqual( [ `Home` ] )
        expect( result.current.labels.map( l => l.name ) ).toEqual( [ `errand` ] )
    } )

    it( `re-renders only the edited row of a memoized list`, () => {
        const { store, wrapper } = setup()
        const ids = [ `A`, `B`, `C` ].map( title => add_task( store, { title } ) )
        const renders = {}

        const Row = memo( ( { task } ) => {
            renders[ task.id ] = ( renders[ task.id ] ?? 0 ) + 1
            return createElement( `li`, null, task.title )
        } )
        const List = () => createElement( `ul`, null, use_tasks().map( task => createElement( Row, { key: task.id, task } ) ) )

        const { container } = render( createElement( List ), { wrapper } )
        act( () => update_task( store, ids[ 1 ], { title: `B2` } ) )

        expect( container.textContent ).toBe( `AB2C` )
        expect( renders ).toEqual( { [ ids[ 0 ] ]: 1, [ ids[ 1 ] ]: 2, [ ids[ 2 ] ]: 1 } )
    } )

    it( `throws without a provider`, () => {
        expect( () => renderHook( () => use_tasks() ) ).toThrow( /StoreProvider/ )
    } )

} )
