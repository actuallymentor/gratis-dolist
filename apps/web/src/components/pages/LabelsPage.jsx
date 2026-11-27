import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import styled from 'styled-components'
import { AtSign, Plus } from 'lucide-react'
import { add_label } from '@dolist/store'
import { use_labels, use_store, use_tasks } from '@dolist/store/react'
import Page from '../atoms/Page'
import EmptyState from '../atoms/EmptyState'

const Create = styled.form`
    display: flex; gap: .5rem; margin: -.5rem 0 1.25rem;

    input { flex: 1; min-width: 0; min-height: 44px; padding: 0 .75rem; font: inherit; border: 1px solid var(--line); border-radius: var(--radius); background: var(--surface); color: var(--fg) }
    input:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 5px var(--accent-tint) }
    button {
        display: inline-flex; align-items: center; gap: .35rem; min-height: 44px; padding: 0 1rem; cursor: pointer;
        border: 0; border-radius: 999px; background: var(--accent-strong); color: var(--page); font: inherit; font-weight: 600;
    }
`

const List = styled.ul`
    list-style: none; padding: 0; margin: 0; display: grid; gap: .25rem;

    a {
        display: flex; align-items: center; justify-content: space-between; gap: 1rem; min-height: 44px; padding: 0 .75rem;
        border: 1px solid var(--line-soft); border-radius: var(--radius-sm); background: var(--surface); color: var(--fg); text-decoration: none;
    }
    a:hover, a:focus-visible { background: var(--sunk) }
    a span { color: var(--faint); font-variant-numeric: tabular-nums }
`

/**
 * Every label with its open-task count. New ones come from here or from quick add (@name).
 * Rename and delete live on each label's page.
 */
export default function LabelsPage() {

    const store = use_store()
    const labels = use_labels()
    const tasks = use_tasks()
    const [ draft, set_draft ] = useState( `` )

    // Same tasks the label page lists (open, top-level). A Map: label names are user text (`__proto__` included)
    const counts = useMemo( () => {
        const tally = new Map()
        tasks.filter( task => !task.completed_at && !task.deleted_at && !task.parent_id )
            .forEach( ( { labels: names = [] } ) => names.forEach( name => tally.set( name, ( tally.get( name ) || 0 ) + 1 ) ) )
        return tally
    }, [ tasks ] )

    const create = event => {
        event.preventDefault()
        if( !draft.trim().replace( /^@/, `` ) ) return
        add_label( store, draft )
        set_draft( `` )
    }

    return <Page title="Labels">
        <Create onSubmit={ create } aria-label="New label">
            <input value={ draft } onChange={ ( { target: { value } } ) => set_draft( value ) } placeholder="New label…" aria-label="New label name" />
            <button type="submit"><Plus size={ 18 } strokeWidth={ 2 } aria-hidden />Add label</button>
        </Create>
        { labels.length ? <List>
            { labels.map( label => <li key={ label.id }>
                <Link to={ `/labels/${ label.id }` }>@{ label.name } <span>{ counts.get( label.name ) || `` }</span></Link>
            </li> ) }
        </List> : <EmptyState icon={ AtSign } title="No labels yet">Add one above, or add a task with @name.</EmptyState> }
    </Page>
}
