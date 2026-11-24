import { useState } from 'react'
import styled from 'styled-components'
import TaskCard from './TaskCard'

// Cards rendered before "Show more" (keeps long lists light, plan §5)
const PAGE = 100

const List = styled.div`
    display: grid; gap: .45rem;

    .more { all: unset; cursor: pointer; min-height: 44px; text-align: center; color: var(--muted); font-size: .9rem; border-radius: var(--radius-sm) }
    .more:hover, .more:focus-visible { background: var(--sunk); color: var(--fg) }
`

// Plain vertical list of tasks (Inbox, Today, Search, Outside this view)
export default function TaskList( { tasks, today, on_complete, on_open, on_move, empty } ) {

    const [ limit, set_limit ] = useState( PAGE )
    if( !tasks.length ) return empty || null

    return <List role="list">
        { tasks.slice( 0, limit ).map( task => <div role="listitem" key={ task.id }>
            <TaskCard task={ task } today={ today } on_complete={ on_complete } on_open={ on_open } on_move={ on_move } />
        </div> ) }
        { tasks.length > limit && <button className="more" onClick={ () => set_limit( limit + PAGE * 5 ) }>
            Show { Math.min( PAGE * 5, tasks.length - limit ) } more of { tasks.length - limit }
        </button> }
    </List>
}
