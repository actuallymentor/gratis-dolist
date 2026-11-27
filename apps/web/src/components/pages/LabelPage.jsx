import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import styled from 'styled-components'
import toast from 'react-hot-toast'
import { AtSign, Pencil } from 'lucide-react'
import { delete_label, rename_label, restore_label } from '@dolist/store'
import { use_labels, use_store, use_tasks } from '@dolist/store/react'
import Page from '../atoms/Page'
import EmptyState from '../atoms/EmptyState'
import TaskList from '../molecules/TaskList'
import { use_task_actions } from '../../hooks/use_task_actions'
import { label_tasks } from '../../modules/selectors'
import { flush } from '../../modules/dolist'

const Actions = styled.div`
    display: flex; flex-wrap: wrap; gap: .4rem; margin: -.75rem 0 1.25rem;

    button {
        display: inline-flex; align-items: center; gap: .35rem; min-height: 36px; padding: 0 .8rem; cursor: pointer;
        border: 1px solid var(--line); border-radius: 999px; background: none; color: var(--muted); font: inherit; font-size: .88rem;
    }
    button:hover, button:focus-visible { border-color: var(--accent); color: var(--fg) }
`

const Edit = styled.form`
    display: flex; flex-wrap: wrap; align-items: center; gap: .5rem;
    padding: 1rem; margin: -.75rem 0 1.25rem; border: 1px solid var(--accent); border-radius: var(--radius); background: var(--surface);

    input { flex: 1 1 12rem; min-width: 0; min-height: 40px; padding: 0 .6rem; font: inherit; border: 1px solid var(--line-soft); border-radius: var(--radius-sm); background: var(--page); color: var(--fg) }
    button { min-height: 40px; padding: 0 1rem; border-radius: 999px; cursor: pointer; border: 1px solid var(--line); background: var(--page); color: var(--fg); font: inherit }
    button[type="submit"] { background: var(--accent-strong); border-color: transparent; color: var(--page) }
    .delete { color: var(--bad) }
    .error { flex-basis: 100%; color: var(--bad); font-size: .88rem }
`

// Rename (refuses a name another label has) or delete with Undo
const LabelEditor = ( { label, on_done } ) => {

    const store = use_store()
    const navigate = useNavigate()
    const [ name, set_name ] = useState( label.name )
    const [ error, set_error ] = useState( null )

    const save = event => {
        event.preventDefault()
        if( !rename_label( store, label.id, name ) ) return set_error( name.trim() ? `Another label is already called that.` : `A label needs a name.` )
        on_done()
    }

    const remove = async () => {
        delete_label( store, label.id )
        navigate( `/labels`, { replace: true } )
        const saved = await flush().then( () => true, () => false )
        if( !saved ) return
        toast( t => <span>Deleted “@{ label.name }” <button onClick={ () => {
            restore_label( store, label.id )
            toast.dismiss( t.id )
        } }
        >Undo</button></span> )
    }

    return <Edit onSubmit={ save } aria-label="Edit label">
        <input value={ name } autoFocus aria-label="Label name" onChange={ ( { target: { value } } ) => {
            set_name( value )
            set_error( null )
        } }
        />
        <button type="submit">Save</button>
        <button type="button" onClick={ on_done }>Cancel</button>
        <button type="button" className="delete" onClick={ remove }>Delete label</button>
        { error && <p className="error" role="alert">{ error }</p> }
    </Edit>
}

/**
 * One label: its open tasks. Deleting hides it from tasks; Undo puts it back everywhere.
 */
export default function LabelPage() {

    const { id } = useParams()
    const labels = use_labels()
    const tasks = use_tasks()
    const { today, on_complete, on_open } = use_task_actions()
    const [ editing, set_editing ] = useState( false )
    const label = labels.find( row => row.id === id )

    if( !label ) return <Page title="Label">
        <EmptyState icon={ AtSign } title="Label not found">It may have been deleted. <Link to="/labels">All labels</Link></EmptyState>
    </Page>

    return <Page title={ `@${ label.name }` }>
        { editing
            ? <LabelEditor key={ label.id } label={ label } on_done={ () => set_editing( false ) } />
            : <Actions><button type="button" onClick={ () => set_editing( true ) }><Pencil size={ 15 } strokeWidth={ 1.5 } aria-hidden />Edit</button></Actions> }
        <TaskList tasks={ label_tasks( tasks, label.name ) } today={ today } on_complete={ on_complete } on_open={ on_open } empty={
            <EmptyState icon={ AtSign } title={ `Nothing labelled @${ label.name }` }>Add @{ label.name } to a task to see it here.</EmptyState>
        }
        />
    </Page>
}
