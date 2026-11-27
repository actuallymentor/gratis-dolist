// Open = not completed, not deleted, top-level (subtasks live in their parent's detail)
const is_open = ( { completed_at, deleted_at, parent_id } ) => !completed_at && !deleted_at && !parent_id

const by_soonest = ( a, b ) => {
    const soonest = ( { scheduled, deadline } ) => [ scheduled, deadline ].filter( Boolean ).sort()[ 0 ] || `9999`
    return soonest( a ).localeCompare( soonest( b ) ) || ( a.priority || 5 ) - ( b.priority || 5 ) || ( a.created_at || 0 ) - ( b.created_at || 0 )
}

/**
 * Triage: open tasks; each flag on = keep only tasks that lack it (lacks.date = unscheduled)
 * @param {object[]} tasks
 * @param {{ date: boolean, deadline: boolean, project: boolean }} lacks
 */
export const triage_tasks = ( tasks, lacks ) => tasks
    .filter( task => is_open( task )
        && !( lacks.date && task.scheduled )
        && !( lacks.deadline && task.deadline )
        && !( lacks.project && task.project_id ) )
    .sort( by_soonest )

export const open_tasks = tasks => tasks.filter( is_open )

/* ---------------------------------------------------------------------------
   Projects: nested by parent_id
--------------------------------------------------------------------------- */

/**
 * Projects depth-first (children after their parent, by name), each with depth and `path` (Work/Clients)
 * @param {object[]} projects - live rows, sorted by name
 * @returns {Array<object & { depth: number, path: string }>}
 */
export const project_tree = projects => {
    const ids = new Set( projects.map( ( { id } ) => id ) )
    const children = parent_id => projects.filter( project => ( ids.has( project.parent_id ) ? project.parent_id : null ) === parent_id )
    const walk = ( parent_id, depth, prefix, seen ) => children( parent_id )
        .filter( ( { id } ) => !seen.has( id ) )
        .flatMap( project => {
            const path = prefix ? `${ prefix }/${ project.name }` : project.name
            return [ { ...project, depth, path }, ...walk( project.id, depth + 1, path, new Set( [ ...seen, project.id ] ) ) ]
        } )
    return walk( null, 0, ``, new Set() )
}

/**
 * A project and all its subprojects
 * @param {object[]} projects
 * @param {string} id
 * @returns {Set<string>}
 */
export const subtree_ids = ( projects, id ) => {
    const ids = new Set( [ id ] )
    let grew = true
    while( grew ) {
        const before = ids.size
        projects.forEach( project => ids.has( project.parent_id ) && ids.add( project.id ) )
        grew = ids.size > before
    }
    return ids
}

// Open tasks in a project or any of its subprojects
export const project_tasks = ( tasks, ids ) => tasks.filter( task => is_open( task ) && ids.has( task.project_id ) ).sort( by_soonest )

/**
 * A depth-first project tree minus the descendants of folded projects
 * @param {Array<{ id: string, depth: number }>} tree - from project_tree
 * @param {( id: string ) => boolean} is_folded
 * @returns {Array<object & { has_children: boolean }>}
 */
export const visible_tree = ( tree, is_folded ) => {
    let fold_depth = Infinity
    return tree.flatMap( ( project, index ) => {
        if( project.depth > fold_depth ) return []
        fold_depth = is_folded( project.id ) ? project.depth : Infinity
        return [ { ...project, has_children: tree[ index + 1 ]?.depth > project.depth } ]
    } )
}
