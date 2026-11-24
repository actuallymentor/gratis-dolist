// Recipes = ordered lanes of filter queries (plan §2.6, §7.1).
// Cascade on: each task lands in the first lane it fits ("soonest date wins" falls out of date:… ranges).
//
// recipe = { id, name, cascade, lanes: [ { id, name, query, sort?: `date`|`priority`|`deadline`, drop?: `auto`|`none`|{ set } } ] }

import { add_days, diff_days, resolve_date_label } from './dates.js'
import { compile_filter, range_end } from './filters.js'

const SEARCH_DAYS = 730

/**
 * Which rolling Horizons lane a task belongs to, by its soonest date (plan §7.1); mirrors default_horizons_recipe
 * @param {{ scheduled?: string, deadline?: string }} task - ISO dates (YYYY-MM-DD), floating
 * @param {string} today - ISO date
 * @returns {`overdue`|`today`|`week`|`month`|`quarter`|`later`|null}
 */
export const horizon_of = ( { scheduled, deadline }, today ) => {

    const [ soonest ] = [ scheduled, deadline ].filter( Boolean ).sort()
    if( !soonest ) return null

    const days = diff_days( soonest, today )
    if( days < 0 ) return `overdue`
    if( days < 1 ) return `today`
    if( days < 7 ) return `week`
    if( days < 30 ) return `month`
    if( days < 90 ) return `quarter`
    return `later`
}

/**
 * The default board: rolling Today / This week / This month / This quarter, cascade on, overdue in Today
 * @returns {object} recipe
 */
export const default_horizons_recipe = () => ( {
    id: `horizons`,
    name: `Horizons`,
    cascade: true,
    lanes: [
        { id: `today`, name: `Today`, query: `date:today`, sort: `priority` },
        { id: `week`, name: `This week`, query: `date:7d`, sort: `date` },
        { id: `month`, name: `This month`, query: `date:30d`, sort: `date` },
        { id: `quarter`, name: `This quarter`, query: `date:90d`, sort: `date` },
    ],
} )

/* ---------------------------------------------------------------------------
   Placement
--------------------------------------------------------------------------- */

const soonest_of = ( { scheduled, deadline } ) => [ scheduled, deadline ].filter( Boolean ).sort()[ 0 ] || `9999-12-31`
const rank_of = ( { priority } ) => priority || 5

const SORTS = {
    date: ( a, b ) => soonest_of( a ).localeCompare( soonest_of( b ) ) || rank_of( a ) - rank_of( b ),
    priority: ( a, b ) => rank_of( a ) - rank_of( b ) || soonest_of( a ).localeCompare( soonest_of( b ) ),
    deadline: ( a, b ) => ( a.deadline || `9999` ).localeCompare( b.deadline || `9999` ) || rank_of( a ) - rank_of( b ),
}

// Stable tie-break so lanes never shuffle between renders
const sorter = sort => ( a, b ) => ( SORTS[ sort ] || SORTS.date )( a, b ) || `${ a.id ?? `` }`.localeCompare( `${ b.id ?? `` }` )

const is_live = ( { completed_at, deleted_at } ) => !completed_at && !deleted_at

const compile_lanes = recipe => recipe.lanes.map( lane => ( { ...lane, ...compile_filter( lane.query ) } ) )

// Index of the first lane a task fits (cascade semantics), or -1
const first_lane = ( task, lanes, ctx ) => lanes.findIndex( lane => lane.fn( task, ctx ) )

// Effective date window of a simple `date:<period>` lane, after earlier lanes took their share
const window_of = ( lanes, index, ctx, cascade ) => {
    const end_of = lane => {
        const match = lane.query.trim().match( /^date:(today|tomorrow|week|month|quarter|\d+d)$/i )
        return match ? range_end( match[ 1 ].toLowerCase(), ctx ) : null
    }
    const end = end_of( lanes[ index ] )
    if( !end ) return null
    const previous = index > 0 && cascade ? end_of( lanes[ index - 1 ] ) : null
    return { start: previous ? add_days( previous, 1 ) : null, end }
}

/**
 * Sorts tasks into a recipe's lanes
 * @param {object[]} tasks - completed / deleted ones are ignored
 * @param {object} recipe
 * @param {{ today: string, week_start?: number, projects?: object[], labels?: object[], is_blocked?: Function }} ctx
 * @returns {{ lanes: Array<{ id, name, tasks, range?, error? }>, outside: object[] }} outside = live tasks no lane took
 */
export const distribute = ( tasks, recipe, ctx ) => {

    const lanes = compile_lanes( recipe )
    const live = tasks.filter( is_live )

    // Cascade: one lane per task. Off: every lane that matches
    const buckets = lanes.map( () => [] )
    const outside = []
    live.forEach( task => {
        const hits = recipe.cascade
            ? [ first_lane( task, lanes, ctx ) ].filter( index => index >= 0 )
            : lanes.flatMap( ( lane, index ) => lane.fn( task, ctx ) ? [ index ] : [] )
        if( !hits.length ) outside.push( task )
        hits.forEach( index => buckets[ index ].push( task ) )
    } )

    return {
        lanes: lanes.map( ( lane, index ) => ( {
            id: lane.id,
            name: lane.name,
            tasks: buckets[ index ].sort( sorter( lane.sort ) ),
            range: window_of( lanes, index, ctx, recipe.cascade ),
            ...lane.error && { error: lane.error },
        } ) ),
        outside: outside.sort( sorter( `date` ) ),
    }
}

/**
 * What dropping a task on a lane does: the earliest scheduled date (from today) that puts it there.
 * A deadline that already places it in an earlier lane pins it (refused, with a reason to show).
 * lane_id `outside` (or null) clears the scheduled date when nothing else keeps it on the board.
 * @param {object} task
 * @param {string|null} lane_id
 * @param {object} recipe
 * @param {object} ctx - as distribute
 * @returns {{ patch: object } | { refused: true, reason: string }} empty patch = already there
 */
export const move = ( task, lane_id, recipe, ctx ) => {

    const lanes = compile_lanes( recipe )
    const to_outside = lane_id === null || lane_id === `outside`
    const target = lanes.findIndex( lane => lane.id === lane_id )
    if( !to_outside && target < 0 ) return { refused: true, reason: `That lane doesn't exist any more` }

    const lane = lanes[ target ]
    const name = to_outside ? `Outside this view` : lane.name
    const fits = candidate => {
        if( to_outside ) return lanes.every( each => !each.fn( candidate, ctx ) )
        return recipe.cascade ? first_lane( candidate, lanes, ctx ) === target : lane.fn( candidate, ctx )
    }

    if( lane?.drop === `none` ) return { refused: true, reason: `${ name } doesn't take drops` }
    if( lane?.error ) return { refused: true, reason: `${ name } has a broken rule: ${ lane.error }` }
    if( fits( task ) ) return { patch: {} }

    // Lanes that set fields (priority, project…) instead of dates
    if( lane?.drop?.set ) {
        const candidate = { ...task, ...lane.drop.set }
        return fits( candidate ) ? { patch: lane.drop.set } : { refused: true, reason: `Setting ${ Object.keys( lane.drop.set ).join( `, ` ) } doesn't put it in ${ name }` }
    }

    // Deadline pin: with only its deadline, the task would already sit in an earlier lane
    const by_deadline = recipe.cascade && task.deadline ? first_lane( { ...task, scheduled: null }, lanes, ctx ) : -1
    if( by_deadline >= 0 && ( to_outside || by_deadline < target ) ) {
        return { refused: true, reason: `Its deadline (${ resolve_date_label( task.deadline, ctx.today ) }) keeps it in ${ lanes[ by_deadline ].name }` }
    }

    if( to_outside ) {
        const patch = { scheduled: null, time: null }
        return fits( { ...task, ...patch } ) ? { patch } : { refused: true, reason: `Its other details keep it on the board` }
    }

    // Earliest day from today that lands in the lane (works for any query, not just date lanes)
    const offset = Array.from( { length: SEARCH_DAYS }, ( _, day ) => day ).find( day => fits( { ...task, scheduled: add_days( ctx.today, day ) } ) )
    if( offset === undefined ) return { refused: true, reason: `No date puts it in ${ name }. Edit the lane or the task.` }

    return { patch: { scheduled: add_days( ctx.today, offset ) } }
}
