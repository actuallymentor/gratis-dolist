import { useMemo } from 'react'
import styled from 'styled-components'
import { CircleCheck, RotateCcw } from 'lucide-react'
import { completed_history, uncomplete_task } from '@dolist/store'
import { use_store, use_tasks } from '@dolist/store/react'
import Page from '../atoms/Page'
import EmptyState from '../atoms/EmptyState'
import toast from 'react-hot-toast'
import { flush } from '../../modules/dolist'

const Rows = styled.ol`
    list-style: none; margin: 0; padding: 0; display: grid; gap: .35rem;

    li { display: flex; align-items: center; gap: .75rem; padding: .5rem .75rem; border-radius: var(--radius-sm); background: var(--surface); border: 1px solid var(--line-soft) }
    .t { flex: 1; color: var(--muted); text-decoration: line-through; text-decoration-color: var(--faint); overflow-wrap: anywhere }
    time { color: var(--faint); font-size: .8rem; white-space: nowrap }
    button { all: unset; cursor: pointer; display: inline-flex; align-items: center; gap: .3rem; min-height: 44px; padding: 0 .6rem; border-radius: 999px; color: var(--muted); font-size: .85rem }
    button:hover, button:focus-visible { background: var(--sunk); color: var(--fg) }
`

const when = at => new Date( at ).toLocaleString( undefined, { day: `numeric`, month: `short`, hour: `2-digit`, minute: `2-digit` } )

// Completed history, newest first, with Reopen
export default function CompletedPage() {

    const store = use_store()
    const tasks = use_tasks( { include_completed: true } )
    // Reopen, acked once on disk (like every other change)
    const reopen = async ( task, occurrence ) => {
        uncomplete_task( store, task.id, occurrence )
        const saved = await flush().then( () => true, () => false )
        if( saved ) toast( `Reopened “${ task.title }”` )
    }

    const history = useMemo( () => completed_history( store, { limit: 200 } ), [ store, tasks ] )

    return <Page title="Completed">
        { !history.length && <EmptyState icon={ CircleCheck } title="Nothing completed yet">Finished tasks are kept here, so you can reopen them.</EmptyState> }
        <Rows>
            { history.map( ( { task, occurrence, at } ) => <li key={ `${ task.id }:${ occurrence || `` }` }>
                <span className="t">{ task.title }</span>
                <time dateTime={ new Date( at ).toISOString() }>{ when( at ) }</time>
                <button onClick={ () => reopen( task, occurrence ) }><RotateCcw size={ 14 } aria-hidden /> Reopen</button>
            </li> ) }
        </Rows>
    </Page>
}
