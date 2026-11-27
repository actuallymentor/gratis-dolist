import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import styled from 'styled-components'
import toast from 'react-hot-toast'
import { Columns3, FolderTree, Pencil } from 'lucide-react'
import { delete_project, restore_project, update_project } from '@dolist/store'
import { use_projects, use_store, use_tasks } from '@dolist/store/react'
import Page from '../atoms/Page'
import EmptyState from '../atoms/EmptyState'
import TaskList from '../molecules/TaskList'
import { use_task_actions } from '../../hooks/use_task_actions'
import { use_project_scope } from '../../hooks/use_project_scope'
import { project_tasks, project_tree, subtree_ids } from '../../modules/selectors'
import { flush } from '../../modules/dolist'

const Links = styled.nav`
    display: flex; flex-wrap: wrap; gap: .4rem; margin: -.75rem 0 1.25rem;

    a, button {
        display: inline-flex; align-items: center; gap: .35rem; min-height: 36px; padding: 0 .8rem; cursor: pointer;
        border: 1px solid var(--line); border-radius: 999px; background: none; color: var(--muted); text-decoration: none; font: inherit; font-size: .88rem;
    }
    a:hover, a:focus-visible, button:hover, button:focus-visible { border-color: var(--accent); color: var(--fg) }
`

const Edit = styled.form`
    display: grid; grid-template-columns: 6rem minmax( 0, 1fr ); align-items: center; gap: .6rem .75rem;
    padding: 1rem; margin: -.75rem 0 1.25rem; border: 1px solid var(--accent); border-radius: var(--radius); background: var(--surface);

    input, select { min-width: 0; min-height: 40px; padding: 0 .6rem; font: inherit; border: 1px solid var(--line-soft); border-radius: var(--radius-sm); background: var(--page); color: var(--fg) }
    .actions { grid-column: 1 / -1; display: flex; flex-wrap: wrap; gap: .5rem }
    button { min-height: 40px; padding: 0 1rem; border-radius: 999px; cursor: pointer; border: 1px solid var(--line); background: var(--page); color: var(--fg); font: inherit }
    button[type="submit"] { background: var(--accent-strong); border-color: transparent; color: var(--page) }
    .delete { margin-left: auto; color: var(--bad) }
    .error { grid-column: 1 / -1; color: var(--bad); font-size: .88rem }
    .note { grid-column: 1 / -1; color: var(--muted); font-size: .85rem }

    @media ( max-width: 480px ) { grid-template-columns: minmax( 0, 1fr ) }
`

const REFUSED = {
    name: `A project needs a name.`,
    cycle: `A project can't go inside itself or its subprojects.`,
    taken: `There's already a project with that name there.`,
    missing: `This project no longer exists.`,
}

// Rename, move under another project (never into its own subtree), or delete with Undo.
// Saves only what you changed, so a rename here never undoes a move made on another device meanwhile
const ProjectEditor = ( { project, on_done } ) => {

    const store = use_store()
    const navigate = useNavigate()
    const projects = use_projects()
    const tasks = use_tasks()
    const [ initial ] = useState( () => ( { name: project.name, parent_id: project.parent_id || `` } ) )
    const [ name, set_name ] = useState( initial.name )
    const [ parent_id, set_parent_id ] = useState( initial.parent_id )
    const [ error, set_error ] = useState( null )

    // Possible parents: everything outside this project's own subtree (by id: same-named projects elsewhere stay)
    const own = useMemo( () => subtree_ids( projects, project.id ), [ projects, project.id ] )
    const parents = useMemo( () => project_tree( projects ).filter( ( { id } ) => !own.has( id ) ), [ projects, own ] )

    // What Delete takes with it, said before the click
    const subprojects = own.size - 1
    const affected = tasks.filter( task => !task.completed_at && !task.deleted_at && own.has( task.project_id ) ).length

    const save = event => {
        event.preventDefault()
        if( name.includes( `/` ) ) return set_error( `Names can't contain "/": that's how #Parent/Child is written.` )
        const changes = {
            ...name.trim() !== initial.name && { name },
            ...parent_id !== initial.parent_id && { parent_id: parent_id || null },
        }
        const refused = Object.keys( changes ).length ? update_project( store, project.id, changes ) : null
        if( refused ) return set_error( REFUSED[ refused ] )
        on_done()
    }

    const remove = async () => {
        const deleted = delete_project( store, project.id )
        navigate( `/projects`, { replace: true } )
        const saved = await flush().then( () => true, () => false )
        if( !saved ) return
        const more = deleted.length > 1 ? ` and ${ deleted.length - 1 } subproject${ deleted.length > 2 ? `s` : `` }` : ``
        toast( t => <span>Deleted “{ project.name }”{ more } <button onClick={ () => {
            restore_project( store, deleted )
            toast.dismiss( t.id )
        } }
        >Undo</button></span>, { duration: 10_000 } )
    }

    return <Edit onSubmit={ save } aria-label="Edit project">
        <label htmlFor="p-name">Name</label>
        <input id="p-name" value={ name } autoFocus onChange={ ( { target: { value } } ) => {
            set_name( value )
            set_error( null )
        } }
        />
        <label htmlFor="p-parent">Inside</label>
        <select id="p-parent" value={ parent_id } onChange={ ( { target: { value } } ) => {
            set_parent_id( value )
            set_error( null )
        } }
        >
            <option value="">No parent (top level)</option>
            { parents.map( ( { id, name: label, depth } ) => <option key={ id } value={ id }>{ `\u2003`.repeat( depth ) }{ label }</option> ) }
        </select>
        { error && <p className="error" role="alert">{ error }</p> }
        { ( subprojects > 0 || affected > 0 ) && <p className="note">
            Deleting also removes { subprojects > 0 ? `${ subprojects } subproject${ subprojects > 1 ? `s` : `` }` : `no subprojects` };
            { ` ${ affected } open task${ affected === 1 ? `` : `s` }` } become unfiled.
        </p> }
        <div className="actions">
            <button type="submit">Save</button>
            <button type="button" onClick={ on_done }>Cancel</button>
            <button type="button" className="delete" onClick={ remove }>Delete project</button>
        </div>
    </Edit>
}

/**
 * One project: its open tasks and its subprojects' (cards name the project); Add task here files into it.
 * Links to its Horizons board and each subproject; Edit renames, moves or deletes it (subprojects go with it, tasks become unfiled; Undo restores).
 */
export default function ProjectPage() {

    const { id } = useParams()
    const tasks = use_tasks()
    const { today, on_complete, on_open } = use_task_actions()
    const { project, ids, children } = use_project_scope( id )
    const [ editing, set_editing ] = useState( false )

    if( !project ) return <Page title="Project">
        <EmptyState icon={ FolderTree } title="Project not found">It may have been deleted. <Link to="/projects">All projects</Link></EmptyState>
    </Page>

    const parent = project.path.includes( `/` ) ? project.path.split( `/` ).slice( 0, -1 ).join( ` / ` ) : null

    return <Page title={ project.name } subtitle={ parent && `in ${ parent }` }>
        { editing
            ? <ProjectEditor key={ project.id } project={ project } on_done={ () => set_editing( false ) } />
            : <Links aria-label="Project">
                <button type="button" onClick={ () => set_editing( true ) }><Pencil size={ 15 } strokeWidth={ 1.5 } aria-hidden />Edit</button>
                <Link to={ `/horizons/${ project.id }` }><Columns3 size={ 16 } strokeWidth={ 1.5 } aria-hidden />Horizons</Link>
                { children.map( child => <Link key={ child.id } to={ `/projects/${ child.id }` }>#{ child.name }</Link> ) }
            </Links> }
        <TaskList tasks={ project_tasks( tasks, ids ) } today={ today } on_complete={ on_complete } on_open={ on_open } empty={
            <EmptyState icon={ FolderTree } title={ `Nothing in ${ project.name }` }>Add a task while you're here, or use #{ project.name } anywhere.</EmptyState>
        }
        />
    </Page>
}
