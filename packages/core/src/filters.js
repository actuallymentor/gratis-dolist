// Filter language (plan §2.6): a tiny recursive-descent parser → AST → predicate + English.
//
//   combine    a & b · a b (implicit and) · a | b · !a · ( … )
//   dates      date: (either date) · due: (scheduled) · deadline:  +  today|tomorrow|Nd|week|month|quarter|none|overdue
//              ranges run up to and including the period's end, so overdue items match too (date:7d = by today+6)
//   overdue    !1–!4 / p1–p4    #project (##project = with subprojects, #inbox = no project)    @label    field:value
//   flags      blocked · ready · recurring · sub · has:date|due|deadline|time|recur|labels|project|notes · today (= date:today)

import { add_days, end_of_month, end_of_quarter, end_of_week, to_days } from './dates.js'

const DATE_FIELDS = [ `date`, `due`, `deadline` ]
const FLAGS = [ `blocked`, `ready`, `recurring`, `sub` ]
const HAS = [ `date`, `due`, `deadline`, `time`, `recur`, `labels`, `project`, `notes` ]

const loose = name => `${ name ?? `` }`.toLowerCase().replace( /[\s_-]+/g, ` ` ).trim()
const unquote = text => text.replace( /^"(.*)"$/, `$1` )

/* ---------------------------------------------------------------------------
   Parse
--------------------------------------------------------------------------- */

// `!` before 1–4 is a priority, otherwise negation; quoted names stay one token
const TOKEN_RX = /\(|\)|&|\||![1-4](?=$|[\s)])|!|[#@]{1,2}"[^"]*"|[a-z][\w-]*:"[^"]*"|[^\s()&|!]+/gi

const read_term = raw => {

    const token = raw.toLowerCase()
    if( token === `overdue` ) return { what: `overdue` }
    if( token === `today` ) return { what: `date`, field: `date`, range: `today` }
    if( FLAGS.includes( token ) ) return { what: `flag`, flag: token }
    if( /^[!p][1-4]$/.test( token ) ) return { what: `priority`, n: Number( token[ 1 ] ) }
    if( token.startsWith( `##` ) ) return { what: `project`, name: unquote( raw.slice( 2 ) ), deep: true }
    if( token.startsWith( `#` ) ) return { what: `project`, name: unquote( raw.slice( 1 ) ), deep: false }
    if( token.startsWith( `@` ) ) return { what: `label`, name: unquote( raw.slice( 1 ) ) }

    const match = raw.match( /^([a-z][\w-]*):(.+)$/i )
    if( !match ) throw new Error( `"${ raw }" isn't something I can filter on` )
    const [ , key, value ] = match
    const field = key.toLowerCase()

    if( field === `has` ) {
        if( !HAS.includes( value.toLowerCase() ) ) throw new Error( `has: takes ${ HAS.join( `, ` ) }` )
        return { what: `has`, prop: value.toLowerCase() }
    }

    if( DATE_FIELDS.includes( field ) ) {
        const range = value.toLowerCase()
        if( ![ `today`, `tomorrow`, `week`, `month`, `quarter`, `none`, `overdue` ].includes( range ) && !/^\d{1,4}d$/.test( range ) ) {
            throw new Error( `"${ value }" isn't a period. Use today, 7d, week, month, quarter or none` )
        }
        return { what: `date`, field, range }
    }

    return { what: `field`, name: field, value: unquote( value ) }
}

const parse = query => {

    const tokens = query.match( TOKEN_RX ) || []
    let index = 0
    const peek = () => tokens[ index ]
    const next = () => tokens[ index++ ]

    function or_expr() {
        const items = [ and_expr() ]
        while( peek() === `|` ) {
            next()
            items.push( and_expr() )
        }
        return items.length > 1 ? { kind: `or`, items } : items[ 0 ]
    }

    function and_expr() {
        const items = [ not_expr() ]
        while( peek() && peek() !== `)` && peek() !== `|` ) {
            if( peek() === `&` ) next()
            items.push( not_expr() )
        }
        return items.length > 1 ? { kind: `and`, items } : items[ 0 ]
    }

    function not_expr() {
        if( peek() !== `!` ) return atom()
        next()
        return { kind: `not`, item: not_expr() }
    }

    function atom() {
        const token = next()
        if( token === undefined ) throw new Error( `The query ends too early` )
        if( token === `(` ) {
            const inner = or_expr()
            if( next() !== `)` ) throw new Error( `A ( is never closed` )
            return inner
        }
        if( [ `)`, `&`, `|` ].includes( token ) ) throw new Error( `Didn't expect "${ token }" here` )
        return { kind: `term`, term: read_term( token ) }
    }

    if( !tokens.length ) return { kind: `all` }
    const tree = or_expr()
    if( index < tokens.length ) throw new Error( `Didn't expect "${ tokens[ index ] }" here` )
    return tree
}

/* ---------------------------------------------------------------------------
   Evaluate
--------------------------------------------------------------------------- */

/**
 * Last day (inclusive) a period reaches, or null for `none` / `overdue`
 * @param {string} range - today|tomorrow|Nd|week|month|quarter
 * @param {{ today: string, week_start?: number }} ctx
 */
export const range_end = ( range, { today, week_start = 1 } ) => {
    if( range === `today` ) return today
    if( range === `tomorrow` ) return add_days( today, 1 )
    if( range === `week` ) return end_of_week( today, week_start )
    if( range === `month` ) return end_of_month( today )
    if( range === `quarter` ) return end_of_quarter( today )
    const days = range.match( /^(\d+)d$/ )
    return days ? add_days( today, Math.max( Number( days[ 1 ] ), 1 ) - 1 ) : null
}

// Project names along the parent chain: [ own, parent, … ] (tasks carry a name or a project_id into ctx.projects)
const project_chain = ( task, { projects = [] } ) => {
    if( task.project ) return [ task.project ]
    const by_id = new Map( projects.map( project => [ project.id, project ] ) )
    const walk = ( id, guard ) => {
        const project = id && guard && by_id.get( id )
        return project ? [ project.name, ...walk( project.parent_id, guard - 1 ) ] : []
    }
    return walk( task.project_id, 10 )
}

const label_names = ( task, { labels = [] } ) => {
    const by_id = new Map( labels.map( label => [ label.id, label.name ] ) )
    return ( task.labels || [] ).map( label => loose( by_id.get( label ) ?? label ) )
}

const is_blocked = ( task, ctx ) => ctx.is_blocked ? !!ctx.is_blocked( task ) : !!task.blocked

const dates_of = ( task, field ) => field === `due` ? [ task.scheduled ] : field === `deadline` ? [ task.deadline ] : [ task.scheduled, task.deadline ]

const test_term = ( term, task, ctx ) => {

    const { what } = term

    if( what === `date` ) {
        const dates = dates_of( task, term.field ).filter( Boolean )
        if( term.range === `none` ) return !dates.length
        if( term.range === `overdue` ) return dates.some( date => date < ctx.today )
        const end = range_end( term.range, ctx )
        return dates.some( date => date <= end )
    }

    if( what === `overdue` ) return [ task.scheduled, task.deadline ].some( date => date && date < ctx.today )
    if( what === `priority` ) return task.priority === term.n

    if( what === `project` ) {
        const chain = project_chain( task, ctx ).map( loose )
        if( !chain.length ) return loose( term.name ) === `inbox`
        const own_path = [ ...chain ].reverse().join( `/` )
        if( term.deep ) return chain.includes( loose( term.name ) ) || `${ own_path }/`.startsWith( `${ loose( term.name ) }/` )
        return chain[ 0 ] === loose( term.name ) || own_path === loose( term.name )
    }

    if( what === `label` ) return label_names( task, ctx ).includes( loose( term.name ) )

    if( what === `field` ) {
        const fields = task.fields || {}
        const key = Object.keys( fields ).find( name => loose( name ) === loose( term.name ) )
        return key !== undefined && loose( fields[ key ] ) === loose( term.value )
    }

    if( what === `flag` ) {
        if( term.flag === `blocked` ) return is_blocked( task, ctx )
        if( term.flag === `ready` ) return !is_blocked( task, ctx )
        if( term.flag === `recurring` ) return !!task.recur
        return !!task.parent_id
    }

    if( what === `has` ) {
        const value = { date: task.scheduled || task.deadline, due: task.scheduled, recur: task.recur, labels: task.labels?.length, project: task.project || task.project_id }[ term.prop ] ?? task[ term.prop ]
        return !!value
    }

    return false
}

const evaluate = ( node, task, ctx ) => {
    if( node.kind === `all` ) return true
    if( node.kind === `term` ) return test_term( node.term, task, ctx )
    if( node.kind === `not` ) return !evaluate( node.item, task, ctx )
    if( node.kind === `and` ) return node.items.every( item => evaluate( item, task, ctx ) )
    return node.items.some( item => evaluate( item, task, ctx ) )
}

const compiled_cache = new Map()

/**
 * Compiles a filter query into a predicate (cached per query string)
 * @param {string} query
 * @returns {{ fn: (task: object, ctx: { today: string, week_start?: number, projects?: object[], labels?: object[], is_blocked?: Function }) => boolean, tree?: object, error?: string }}
 */
export const compile_filter = ( query = `` ) => {

    if( compiled_cache.has( query ) ) return compiled_cache.get( query )

    const compiled = ( () => {
        try {
            const tree = parse( query )
            return { fn: ( task, ctx ) => evaluate( tree, task, ctx ), tree }
        } catch ( error ) {
            return { fn: () => false, error: error.message }
        }
    } )()

    // Bounded: queries come from a handful of recipes, but typing produces many drafts
    if( compiled_cache.size > 500 ) compiled_cache.clear()
    compiled_cache.set( query, compiled )
    return compiled
}

/* ---------------------------------------------------------------------------
   Describe
--------------------------------------------------------------------------- */

const PERIOD_WORDS = { today: `today`, tomorrow: `tomorrow`, week: `the end of the week`, month: `the end of the month`, quarter: `the end of the quarter` }
const FIELD_WORDS = { date: `scheduled or deadline`, due: `scheduled`, deadline: `deadline` }

const short_date = iso => new Intl.DateTimeFormat( `en-GB`, { weekday: `short`, day: `numeric`, month: `short`, timeZone: `UTC` } ).format( new Date( to_days( iso ) * 86_400_000 ) )

const describe_term = ( term, ctx ) => {

    const { what } = term

    if( what === `date` ) {
        if( term.range === `none` ) return { date: `no date`, due: `not scheduled`, deadline: `no deadline` }[ term.field ]
        if( term.range === `overdue` ) return `${ FIELD_WORDS[ term.field ] } overdue`
        const days = term.range.match( /^(\d+)d$/ )
        const period = days ? `the next ${ days[ 1 ] === `1` ? `day` : `${ days[ 1 ] } days` }` : PERIOD_WORDS[ term.range ]
        const concrete = ctx?.today ? ` (until ${ short_date( range_end( term.range, ctx ) ) })` : ``
        return `${ FIELD_WORDS[ term.field ] } ${ days ? `within` : `by` } ${ period }${ concrete }`
    }

    if( what === `overdue` ) return `overdue`
    if( what === `priority` ) return `priority ${ term.n }`
    if( what === `project` ) return loose( term.name ) === `inbox` ? `in the Inbox` : `in #${ term.name }${ term.deep ? ` or its subprojects` : `` }`
    if( what === `label` ) return `labelled @${ term.name }`
    if( what === `field` ) return `${ term.name } is ${ term.value }`
    if( what === `flag` ) return { blocked: `blocked`, ready: `not blocked`, recurring: `recurring`, sub: `a subtask` }[ term.flag ]
    if( what === `has` ) return `has ${ { date: `a date`, due: `a scheduled date`, deadline: `a deadline`, time: `a time`, recur: `a repeat`, labels: `labels`, project: `a project`, notes: `notes` }[ term.prop ] }`
    return ``
}

const describe_node = ( node, ctx, parent ) => {
    if( node.kind === `all` ) return `everything`
    if( node.kind === `term` ) return describe_term( node.term, ctx )
    if( node.kind === `not` ) return `not ${ node.item.kind === `term` ? describe_node( node.item, ctx ) : `(${ describe_node( node.item, ctx ) })` }`

    const joined = node.items.map( item => describe_node( item, ctx, node.kind ) ).join( node.kind === `and` ? ` and ` : ` or ` )
    return parent === `and` && node.kind === `or` ? `(${ joined })` : joined
}

/**
 * Plain-English reading of a filter query
 * @param {string} query
 * @param {{ today?: string, week_start?: number }} [ctx] - when given, date periods show their concrete last day
 * @returns {string} sentence (capitalised), or the error message for invalid queries
 */
export const describe = ( query = ``, ctx ) => {
    const { tree, error } = compile_filter( query )
    if( error ) return error
    const text = describe_node( tree, ctx )
    return text.charAt( 0 ).toUpperCase() + text.slice( 1 )
}
