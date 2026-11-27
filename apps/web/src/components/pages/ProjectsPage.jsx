import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import styled from 'styled-components'
import { Columns3, FolderTree, Plus } from 'lucide-react'
import { ensure_project } from '@dolist/store'
import { use_projects, use_store, use_tasks } from '@dolist/store/react'
import Page from '../atoms/Page'
import EmptyState from '../atoms/EmptyState'
import { open_tasks, project_tree } from '../../modules/selectors'

const Tree = styled.ul`
    list-style: none; padding: 0; margin: 0; display: grid; gap: .25rem;

    li { display: flex; align-items: center; gap: .25rem; padding-left: calc( var(--depth) * 1.25rem ) }
    a { display: flex; align-items: center; min-height: 44px; padding: 0 .75rem; border-radius: var(--radius-sm); text-decoration: none; color: var(--fg) }
    a:hover, a:focus-visible { background: var(--sunk) }
    .name { flex: 1; justify-content: space-between; gap: 1rem; background: var(--surface); border: 1px solid var(--line-soft) }
    .name span { color: var(--faint); font-variant-numeric: tabular-nums }
    .board { color: var(--muted); width: 44px; justify-content: center; padding: 0 }
`

const Create = styled.form`
    display: flex; gap: .5rem; margin: -.5rem 0 1.25rem;

    input { flex: 1; min-width: 0; min-height: 44px; padding: 0 .75rem; font: inherit; border: 1px solid var(--line); border-radius: var(--radius); background: var(--surface); color: var(--fg) }
    input:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 5px var(--accent-tint) }
    button {
        display: inline-flex; align-items: center; gap: .35rem; min-height: 44px; padding: 0 1rem; cursor: pointer;
        border: 0; border-radius: 999px; background: var(--accent-strong); color: var(--page); font: inherit; font-weight: 600;
    }
`

/**
 * All projects as a tree: open-task counts (incl. subprojects), each with a link to its own Horizons board.
 * New ones come from the form here or from quick add: #name, #Parent/Child for a subproject (existing levels reused).
 * Rename, move and delete live on each project's page.
 */
export default function ProjectsPage() {

    const projects = use_projects()
    const tasks = use_tasks()
    const store = use_store()
    const tree = useMemo( () => project_tree( projects ), [ projects ] )
    const [ draft, set_draft ] = useState( `` )

    const create = event => {
        event.preventDefault()
        if( !draft.trim() ) return
        ensure_project( store, draft )
        set_draft( `` )
    }

    // Open tasks per project, rolled up into every ancestor
    const counts = useMemo( () => {
        const parent_of = new Map( projects.map( ( { id, parent_id } ) => [ id, parent_id ] ) )
        const tally = {}
        open_tasks( tasks ).forEach( ( { project_id } ) => {
            for( let id = project_id, guard = 10; id && parent_of.has( id ) && guard; id = parent_of.get( id ), guard-- ) tally[ id ] = ( tally[ id ] || 0 ) + 1
        } )
        return tally
    }, [ projects, tasks ] )

    return <Page title="Projects">
        <Create onSubmit={ create } aria-label="New project">
            <input value={ draft } onChange={ ( { target: { value } } ) => set_draft( value ) } placeholder="New project… Work/Clients for a subproject" aria-label="New project name" />
            <button type="submit"><Plus size={ 18 } strokeWidth={ 2 } aria-hidden />Add project</button>
        </Create>
        { tree.length ? <Tree>
            { tree.map( project => <li key={ project.id } style={ { '--depth': project.depth } }>
                <Link className="name" to={ `/projects/${ project.id }` }>{ project.name } <span>{ counts[ project.id ] || `` }</span></Link>
                <Link className="board" to={ `/horizons/${ project.id }` } aria-label={ `Horizons for ${ project.path }` } title="Horizons">
                    <Columns3 size={ 18 } strokeWidth={ 1.5 } aria-hidden />
                </Link>
            </li> ) }
        </Tree> : <EmptyState icon={ FolderTree } title="No projects yet">
            Add one above, or add a task with #name. #Work/Clients makes Clients a subproject of Work.
        </EmptyState> }
    </Page>
}
