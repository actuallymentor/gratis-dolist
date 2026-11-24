import styled from 'styled-components'
import TaskCard from './TaskCard'

const List = styled.div`
    display: grid; gap: .45rem;
`

// Plain vertical list of tasks (Inbox, Today, Search, Outside this view)
export default function TaskList( { tasks, today, on_complete, on_open, empty } ) {
    if( !tasks.length ) return empty || null
    return <List role="list">
        { tasks.map( task => <div role="listitem" key={ task.id }>
            <TaskCard task={ task } today={ today } on_complete={ on_complete } on_open={ on_open } />
        </div> ) }
    </List>
}
