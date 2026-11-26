import { Link, useParams } from 'react-router'
import styled from 'styled-components'
import { Columns3, FolderTree } from 'lucide-react'
import { use_tasks } from '@dolist/store/react'
import Page from '../atoms/Page'
import EmptyState from '../atoms/EmptyState'
import QuickAdd from '../molecules/QuickAdd'
import TaskList from '../molecules/TaskList'
import { use_task_actions } from '../../hooks/use_task_actions'
import { use_project_scope } from '../../hooks/use_project_scope'
import { project_tasks } from '../../modules/selectors'

const Links = styled.nav`
    display: flex; flex-wrap: wrap; gap: .4rem; margin: -.75rem 0 1.25rem;

    a {
        display: inline-flex; align-items: center; gap: .35rem; min-height: 36px; padding: 0 .8rem;
        border: 1px solid var(--line); border-radius: 999px; color: var(--muted); text-decoration: none; font-size: .88rem;
    }
    a:hover, a:focus-visible { border-color: var(--accent); color: var(--fg) }
`

/**
 * One project: its open tasks and its subprojects' (cards name the project), quick add files into it.
 * Links to its Horizons board and straight to each subproject.
 */
export default function ProjectPage() {

    const { id } = useParams()
    const tasks = use_tasks()
    const { today, on_complete, on_open } = use_task_actions()
    const { project, ids, children } = use_project_scope( id )

    if( !project ) return <Page title="Project">
        <EmptyState icon={ FolderTree } title="Project not found">It may have been deleted. <Link to="/projects">All projects</Link></EmptyState>
    </Page>

    const parent = project.path.includes( `/` ) ? project.path.split( `/` ).slice( 0, -1 ).join( ` / ` ) : null

    return <Page title={ project.name } subtitle={ parent && `in ${ parent }` }>
        <Links aria-label="Project">
            <Link to={ `/horizons/${ project.id }` }><Columns3 size={ 16 } strokeWidth={ 1.5 } aria-hidden />Horizons</Link>
            { children.map( child => <Link key={ child.id } to={ `/projects/${ child.id }` }>#{ child.name }</Link> ) }
        </Links>
        <QuickAdd key={ project.id } defaults={ { project_id: project.id } } draft={ `project-${ project.id }` } placeholder={ `Add to ${ project.name }…` } />
        <TaskList tasks={ project_tasks( tasks, ids ) } today={ today } on_complete={ on_complete } on_open={ on_open } empty={
            <EmptyState icon={ FolderTree } title={ `Nothing in ${ project.name }` }>Tasks added here, or with #{ project.name } anywhere, land here.</EmptyState>
        }
        />
    </Page>
}
