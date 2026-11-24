import { useMemo } from 'react'
import styled from 'styled-components'
import { Search } from 'lucide-react'
import { StringParam, useQueryParam, withDefault } from 'use-query-params'
import { search_tasks } from '@dolist/store'
import { use_store, use_tasks } from '@dolist/store/react'
import Page from '../atoms/Page'
import EmptyState from '../atoms/EmptyState'
import TaskList from '../molecules/TaskList'
import { use_task_actions } from '../../hooks/use_task_actions'

const Field = styled.label`
    display: flex; align-items: center; gap: .55rem; margin-bottom: 1.25rem; padding: 0 .75rem;
    border: 1px solid var(--line); border-radius: var(--radius); background: var(--surface); color: var(--faint);
    &:focus-within { box-shadow: 0 0 0 5px var(--accent-tint); border-color: var(--accent) }
    input { flex: 1; border: 0; background: none; outline: none; min-height: 44px; color: var(--fg) }
`

// Search titles + notes; the query lives in the URL (?q=) so it's shareable and survives reloads
export default function SearchPage() {

    const store = use_store()
    const tasks = use_tasks()
    const { today, on_complete, on_open } = use_task_actions()
    const [ q, set_q ] = useQueryParam( `q`, withDefault( StringParam, `` ) )

    // tasks in deps: re-run when data changes
    const results = useMemo( () => q.trim() ? search_tasks( store, q ) : [], [ store, q, tasks ] )

    return <Page title="Search">
        <Field>
            <Search size={ 18 } strokeWidth={ 1.5 } aria-hidden />
            <input type="search" value={ q } autoFocus placeholder="Search tasks and notes" aria-label="Search"
                onChange={ ( { target: { value } } ) => set_q( value || undefined, `replaceIn` ) }
            />
        </Field>
        { q.trim() && <TaskList tasks={ results } today={ today } on_complete={ on_complete } on_open={ on_open } empty={
            <EmptyState icon={ Search } title="No matches">Nothing found for “{ q }”.</EmptyState>
        }
        /> }
    </Page>
}
