import { useMemo } from 'react'
import styled from 'styled-components'
import { Search } from 'lucide-react'
import { StringParam, useQueryParam, withDefault } from 'use-query-params'
import { compile_search } from '@dolist/core'
import { use_labels, use_projects, use_tasks } from '@dolist/store/react'
import Page from '../atoms/Page'
import EmptyState from '../atoms/EmptyState'
import ShorthandField from '../atoms/ShorthandField'
import TaskList from '../molecules/TaskList'
import { use_task_actions } from '../../hooks/use_task_actions'

const Field = styled.label`
    display: flex; align-items: center; gap: .55rem; margin-bottom: 1.25rem; padding: .35rem .75rem;
    border: 1px solid var(--line); border-radius: var(--radius); background: var(--surface); color: var(--faint);
    &:focus-within { box-shadow: 0 0 0 5px var(--accent-tint); border-color: var(--accent) }
`

/**
 * Search speaks quick-add shorthand: `#work by fri`, `tomorrow p2`, `@call p1 p2`, `next week`; other words search title + notes.
 * Understood parts are highlighted like in quick add. The query lives in the URL (?q=): shareable, survives reloads.
 */
export default function SearchPage() {

    const tasks = use_tasks()
    const projects = use_projects()
    const labels = use_labels()
    const { today, on_complete, on_open } = use_task_actions()
    const [ q, set_q ] = useQueryParam( `q`, withDefault( StringParam, `` ) )

    const search = useMemo( () => compile_search( q, { today, projects, labels: labels.map( ( { name } ) => name ) } ), [ q, today, projects, labels ] )

    // Open tasks (subtasks too); completed ones live in Completed (with Reopen)
    const results = useMemo( () => search.empty ? [] : tasks.filter( task => !task.completed_at && !task.deleted_at && search.fn( task ) ), [ tasks, search ] )

    return <Page title="Search">
        <Field>
            <Search size={ 18 } strokeWidth={ 1.5 } aria-hidden />
            <ShorthandField value={ q } spans={ search.spans } autoFocus placeholder={ `Search… try "#work by next week" or "tomorrow p2"` } aria-label="Search"
                onChange={ ( { target: { value } } ) => set_q( value || undefined, `replaceIn` ) } enterKeyHint="search"
            />
        </Field>
        { !search.empty && <TaskList tasks={ results } today={ today } on_complete={ on_complete } on_open={ on_open } empty={
            <EmptyState icon={ Search } title="No matches">Nothing found for “{ q }”.</EmptyState>
        }
        /> }
    </Page>
}
