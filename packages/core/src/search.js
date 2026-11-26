// Search = quick-add shorthand read as a query (same grammar, same highlights):
//   #project (incl. subprojects) · @label (each required) · p1 p2 (any of) · tomorrow / next week (scheduled or deadline in that day/period)
//   by fri / by tom 16 (deadline on or before) · at 9 (that time) · every … (recurring) · anything left = words in title + notes

import { add_days, end_of_month, end_of_week, start_of_month, start_of_week, weekday_of } from './dates.js'
import { parse_quick_add } from './grammar.js'

const fold = text => `${ text ?? `` }`.normalize( `NFD` ).replace( /\p{M}/gu, `` ).toLowerCase()

// Period phrases cover their period: "next week" the whole week, "next month" the month, "this weekend" Sat–Sun.
// Everything else ("in 1 week", "fri") is the one day it resolves to
const period_of = ( { raw, value }, week_start ) => {
    const phrase = raw.toLowerCase().trim().replace( /\s+/g, ` ` )
    if( /^(?:on )?next week$/.test( phrase ) ) return [ start_of_week( value, week_start ), end_of_week( value, week_start ) ]
    if( /^(?:on )?next month$/.test( phrase ) ) return [ start_of_month( value ), end_of_month( value ) ]
    if( /weekend$/.test( phrase ) ) {
        const saturday = weekday_of( value ) === 0 ? add_days( value, -1 ) : value
        return [ saturday, add_days( saturday, 1 ) ]
    }
    return [ value, value ]
}

// Deadline on or before the cutoff; with a cutoff time, a deadline on that day must not be later (untimed = that day, kept)
const before_cutoff = ( { deadline, deadline_time }, { value, time } ) => !!deadline
    && ( deadline < value || deadline === value && ( !time || !deadline_time || deadline_time <= time ) )

const within = ( date, [ start, end ] ) => !!date && date >= start && date <= end

/**
 * Compiles a shorthand search query
 * @param {string} query
 * @param {{ today: string, week_start?: number, projects?: object[], labels?: string[] }} ctx - projects as { id, name, parent_id } rows
 * @returns {{ spans: object[], words: string[], empty: boolean, fn: (task: object) => boolean }} empty = nothing to search for
 */
export const compile_search = ( query = ``, { today, week_start = 1, projects = [], labels = [] } = {} ) => {

    const { task, spans } = parse_quick_add( query, { today, week_start, projects, labels } )
    const of = type => spans.filter( span => span.type === type )

    // Unknown names can't match anything; say so by matching nothing rather than ignoring them
    const impossible = spans.some( ( { unknown } ) => unknown )

    const priorities = new Set( of( `priority` ).map( ( { value } ) => value ) )
    const wanted_labels = of( `label` ).map( ( { value } ) => fold( value ) )
    const periods = of( `date` ).map( span => period_of( span, week_start ) )
    const deadlines = of( `deadline` )
    const times = of( `time` ).map( ( { value } ) => value )
    const recurring = of( `recur` ).length > 0
    const words = fold( task.title ).split( /\s+/ ).filter( Boolean )

    // Project = it and every subproject
    const project = of( `project` ).at( -1 )
    const project_ids = project && !project.unknown && ( () => {
        const ids = new Set( project.id ? [ project.id ] : projects.filter( row => fold( row.name ) === fold( project.value ) ).map( ( { id } ) => id ) )
        let before = -1
        while( before !== ids.size ) {
            before = ids.size
            projects.forEach( row => ids.has( row.parent_id ) && ids.add( row.id ) )
        }
        return ids
    } )()

    const fn = item => {
        if( impossible ) return false
        if( priorities.size && !priorities.has( item.priority ) ) return false
        if( project_ids && !project_ids.has( item.project_id ) ) return false
        const own_labels = ( item.labels || [] ).map( fold )
        if( !wanted_labels.every( label => own_labels.includes( label ) ) ) return false
        if( !periods.every( period => within( item.scheduled, period ) || within( item.deadline, period ) ) ) return false
        if( !deadlines.every( cutoff => before_cutoff( item, cutoff ) ) ) return false
        if( !times.every( time => item.time === time || item.deadline_time === time ) ) return false
        if( recurring && !item.recur ) return false
        const haystack = fold( `${ item.title } ${ item.notes ?? `` }` )
        return words.every( word => haystack.includes( word ) )
    }

    return { spans, words, empty: !spans.length && !words.length, fn }
}
