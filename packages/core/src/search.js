// Search = quick-add shorthand read as a query (same grammar, same highlights):
//   #project (incl. subprojects) · @label (each required) · p1 p2 (any of) · tomorrow / next week (scheduled or deadline in that day/period)
//   by fri (deadline on or before) · anything left = words to find in title + notes (quotes keep grammar words as text)

import { add_days, end_of_month, end_of_week, start_of_month, start_of_week } from './dates.js'
import { parse_quick_add } from './grammar.js'

const fold = text => `${ text ?? `` }`.normalize( `NFD` ).replace( /\p{M}/gu, `` ).toLowerCase()

// A date phrase covers its period: "next week" is the whole week, "next month" the month, "this weekend" Sat–Sun
const period_of = ( { raw, value }, week_start ) => {
    const phrase = raw.toLowerCase()
    if( /week\b/.test( phrase ) && !/weekend/.test( phrase ) ) return [ start_of_week( value, week_start ), end_of_week( value, week_start ) ]
    if( /month\b/.test( phrase ) ) return [ start_of_month( value ), end_of_month( value ) ]
    if( /weekend/.test( phrase ) ) return [ value, add_days( value, 1 ) ]
    return [ value, value ]
}

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
    const deadlines = of( `deadline` ).map( ( { value } ) => value )
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
        if( !deadlines.every( date => item.deadline && item.deadline <= date ) ) return false
        const haystack = fold( `${ item.title } ${ item.notes ?? `` }` )
        return words.every( word => haystack.includes( word ) )
    }

    return { spans, words, empty: !spans.length && !words.length, fn }
}
