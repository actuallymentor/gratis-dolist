import { useMemo } from 'react'
import { use_projects } from '@dolist/store/react'
import { project_tree, subtree_ids } from '../modules/selectors'

/**
 * The project a route points at (with its path, Work/Clients) plus the ids of it and its subprojects
 * @param {string} [id] - route param; none = no scope
 * @returns {{ project: object|null, ids: Set<string>|null, children: object[] }} project null = unknown or deleted
 */
export const use_project_scope = id => {

    const projects = use_projects()

    return useMemo( () => {
        if( !id ) return { project: null, ids: null, children: [] }
        const project = project_tree( projects ).find( row => row.id === id ) ?? null
        return {
            project,
            ids: project && subtree_ids( projects, id ),
            children: projects.filter( ( { parent_id } ) => parent_id === id ),
        }
    }, [ projects, id ] )
}
