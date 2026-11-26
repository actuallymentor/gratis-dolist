import { useMemo } from 'react'
import styled from 'styled-components'
import { Check, ListFilter } from 'lucide-react'
import { BooleanParam, useQueryParams, withDefault } from 'use-query-params'
import { use_tasks } from '@dolist/store/react'
import Page from '../atoms/Page'
import EmptyState from '../atoms/EmptyState'
import TaskList from '../molecules/TaskList'
import { use_task_actions } from '../../hooks/use_task_actions'
import { triage_tasks } from '../../modules/selectors'

// Each toggle includes tasks that have it. Default: nothing dated yet (projects welcome)
const TOGGLES = [
    [ `date`, `Has date`, false ],
    [ `deadline`, `Has deadline`, false ],
    [ `project`, `Has project`, true ],
]
const PARAMS = Object.fromEntries( TOGGLES.map( ( [ key, , fallback ] ) => [ key, withDefault( BooleanParam, fallback ) ] ) )

const Toggles = styled.div`
    display: flex; flex-wrap: wrap; gap: .4rem; margin: -.5rem 0 1.25rem;

    button {
        display: inline-flex; align-items: center; gap: .35rem; min-height: 36px; padding: 0 .85rem; cursor: pointer;
        border: 1px solid var(--line); border-radius: 999px; background: var(--surface); color: var(--muted); font-size: .88rem;
        transition: background 160ms var(--ease), border-color 160ms var(--ease), color 160ms var(--ease);
    }
    button:hover { border-color: var(--accent) }
    button:focus-visible { box-shadow: 0 0 0 5px var(--accent-tint) }
    button[aria-pressed="true"] { background: var(--accent-tint); border-color: var(--accent); color: var(--fg) }
`

/**
 * Triage: a filter view over open tasks. Toggles live in the URL (?date=1), so a setup survives reloads and links.
 */
export default function TriagePage() {

    const tasks = use_tasks()
    const { today, on_complete, on_open } = use_task_actions()
    const [ include, set_include ] = useQueryParams( PARAMS )
    const shown = useMemo( () => triage_tasks( tasks, include ), [ tasks, include ] )

    return <Page title="Triage">
        <Toggles role="group" aria-label="Show tasks that">
            { TOGGLES.map( ( [ key, label ] ) => <button key={ key } type="button" aria-pressed={ include[ key ] }
                onClick={ () => set_include( { [ key ]: !include[ key ] }, `replaceIn` ) }
            >
                { include[ key ] && <Check size={ 14 } strokeWidth={ 2 } aria-hidden /> }{ label }
            </button> ) }
        </Toggles>
        <TaskList tasks={ shown } today={ today } on_complete={ on_complete } on_open={ on_open } empty={
            <EmptyState icon={ ListFilter } title="Nothing to triage">Undated tasks land here. Toggle the filters above to widen the view.</EmptyState>
        }
        />
    </Page>
}
