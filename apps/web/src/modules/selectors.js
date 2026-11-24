import { horizon_of } from '@dolist/core'

// Open = not completed, not deleted, top-level (subtasks live in their parent's detail)
const is_open = ( { completed_at, deleted_at, parent_id } ) => !completed_at && !deleted_at && !parent_id

const by_soonest = ( a, b ) => {
    const soonest = ( { scheduled, deadline } ) => [ scheduled, deadline ].filter( Boolean ).sort()[ 0 ] || `9999`
    return soonest( a ).localeCompare( soonest( b ) ) || ( a.priority || 5 ) - ( b.priority || 5 ) || ( a.created_at || 0 ) - ( b.created_at || 0 )
}

export const inbox_tasks = tasks => tasks.filter( task => is_open( task ) && !task.project_id ).sort( by_soonest )

export const today_tasks = ( tasks, today ) => tasks
    .filter( task => is_open( task ) && [ `overdue`, `today` ].includes( horizon_of( task, today ) ) )
    .sort( by_soonest )

export const project_tasks = ( tasks, project_id ) => tasks.filter( task => is_open( task ) && task.project_id === project_id ).sort( by_soonest )

export const open_tasks = tasks => tasks.filter( is_open )
