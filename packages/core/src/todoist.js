// Todoist export (API v1 shapes) → Dolist rows. Pure: no network, no ids minted.
// Output matches @dolist/store's import_todoist: Todoist ids as todoist_id, projects referenced by Todoist id
// (names ride along for display only; same-named projects are distinct), labels by name,
// the Todoist Inbox becomes "no project".

import { wall_clock } from './dates.js'
import { anchor_recur, parse_recur } from './recurrence.js'

// Todoist API priority 4 = UI p1 (urgent); API 1 = no priority
const PRIORITY = { 4: 1, 3: 2, 2: 3 }

// due.date is `YYYY-MM-DD`, floating `YYYY-MM-DDTHH:MM:SS`, or UTC `…Z` (+ due.timezone)
const due_parts = due => {

    if( !due?.date ) return { scheduled: null, time: null, tz: null }
    const [ date, clock ] = due.date.split( `T` )
    if( !clock ) return { scheduled: date, time: null, tz: null }
    if( !clock.endsWith( `Z` ) ) return { scheduled: date, time: clock.slice( 0, 5 ), tz: due.timezone || null }

    // Fixed instant: show it at the wall-clock time of its zone (bad zone names fall back to UTC)
    try {
        const { date: local_date, time } = wall_clock( new Date( due.date ), due.timezone || `UTC` )
        return { scheduled: local_date, time, tz: due.timezone || `UTC` }
    } catch {
        return { scheduled: date, time: clock.slice( 0, 5 ), tz: `UTC` }
    }
}

// Timestamps are epoch ms, like the store's own clock
const ms_of = stamp => stamp ? Date.parse( stamp ) || null : null

const minutes_of = duration => {
    if( !duration?.amount ) return null
    return duration.unit === `day` ? duration.amount * 1_440 : duration.amount
}

/**
 * Converts a Todoist export into Dolist-shaped projects, labels and tasks
 * @param {{ projects?: object[], labels?: object[], tasks?: object[], completed?: object[] }} export_json - raw API v1 lists
 * @param {{ include_completed?: boolean }} [options]
 * @returns {{ projects: object[], labels: object[], tasks: object[] }}
 *   project = { todoist_id, name, color?, parent_todoist_id?, parent? (name, display only) }   label = { todoist_id, name }
 *   task = { todoist_id, title, notes, project_todoist_id?, project? (name, display only), parent_todoist_id?, labels: [names], priority, scheduled, time, tz, duration, deadline, recur, created_at? (ms), completed_at (ms|null) }
 *   recur = parsed rule anchored to the due date, or { raw, unparsed: true } (kept verbatim, never dropped)
 */
export const from_todoist = ( export_json, { include_completed = true } = {} ) => {

    const { projects: raw_projects = [], labels: raw_labels = [], tasks: active = [], completed = [] } = export_json || {}

    // Inbox is Dolist's "no project"
    const live_projects = raw_projects.filter( project => !project.is_deleted )
    const inbox_ids = new Set( live_projects.filter( project => project.inbox_project ).map( project => project.id ) )

    const name_of = new Map( live_projects.map( project => [ project.id, project.name ] ) )
    const project_name_of = id => id && !inbox_ids.has( id ) ? name_of.get( id ) : undefined

    // Live, non-Inbox project ids only: a reference to anything else means "no project"
    const project_ref = id => project_name_of( id ) !== undefined ? id : undefined

    const projects = live_projects
        .filter( project => !inbox_ids.has( project.id ) )
        .map( project => ( {
            todoist_id: project.id,
            name: project.name,
            ...project.color && { color: project.color },
            ...project_ref( project.parent_id ) && { parent_todoist_id: project.parent_id, parent: project_name_of( project.parent_id ) },
        } ) )

    // Active wins over a completed copy of the same id
    const active_ids = new Set( active.map( task => task.id ) )
    const raw_tasks = [ ...active, ...include_completed ? completed.filter( task => !active_ids.has( task.id ) ) : [] ]
        .filter( task => !task.is_deleted )

    const tasks = raw_tasks.map( task => {

        const { scheduled, time, tz } = due_parts( task.due )
        const recur = task.due?.is_recurring ? anchor_recur( parse_recur( task.due.string ), scheduled ) : null

        return {
            todoist_id: task.id,
            title: task.content ?? ``,
            notes: task.description ?? ``,
            ...project_ref( task.project_id ) && { project_todoist_id: task.project_id, project: project_name_of( task.project_id ) },
            ...task.parent_id && { parent_todoist_id: task.parent_id },
            labels: [ ...task.labels || [] ],
            priority: PRIORITY[ task.priority ] ?? null,
            scheduled, time, tz,
            duration: minutes_of( task.duration ),
            deadline: task.deadline?.date ?? null,
            recur,
            ...task.added_at && { created_at: ms_of( task.added_at ) },
            completed_at: task.checked || task.completed_at ? ms_of( task.completed_at ) : null,
        }
    } )

    // Labels by name; shared labels used on tasks but missing from the list are created by the store
    const labels = raw_labels.map( label => ( { todoist_id: label.id, name: label.name } ) )

    return { projects, labels, tasks }
}
