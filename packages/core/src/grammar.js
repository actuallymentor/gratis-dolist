// Quick-add grammar v1 (plan §2.5): words first, cheap prefixes second, never corrupt a title.
//
//   dates      today · tomorrow · tom · fri · next fri · next week · in 3 days · 12 nov · nov 12th · 2026-12-01
//              (numeric 12/11 is deliberately NOT a date: day/month order is ambiguous and titles hold fractions)
//   deadline   by fri (inclusive) · before fri (the day before) · by tom 16 / by fri at 5pm (deadline time)
//   time       at 3pm · at 15:00 · 3:30pm · at noon · at 18 · at 09 · at 1500 · at 5 (bare 1–6 = afternoon)
//   recurrence every day|weekday|mon|2 weeks|month on 31|year|1st sat|28 nov · every! 3 days (from completion)
//   priority   !1–!4 or p1–p4, whole token only (`!!!` and `wow!1` stay text)
//   project    #Errands · #"Two words" · #Work/Clients      label  @call · @"after work"
//   field      name:value, only for defined fields          literal "by friday" (quotes dropped only if they protect something)
//
// URLs, markdown links and emails are masked first; nothing inside them ever parses.

import { MONTHS, WEEKDAYS, add_days, add_months, days_in_month, is_iso, iso_of, parts_of, start_of_week, weekday_of } from './dates.js'
import { DOW_SRC, MONTH_SRC, ORD_SRC, RECUR_BODY_SRC, anchor_recur, first_occurrence, next_occurrence, parse_recur } from './recurrence.js'

const MASK = ``
const B = String.raw`(?<=^|\s)`
const E = String.raw`(?=$|[\s,.;!?)])`

// Bare `sun`, `sat`, `wed` are everyday words; only their full names count without a prefix
const BARE_DOW_SRC = String.raw`(?:mon(?:day)?|tue(?:s(?:day)?)?|wednesday|thu(?:r(?:s(?:day)?)?)?|fri(?:day)?|saturday|sunday)`
const COUNT_SRC = String.raw`(?:\d{1,3}|an?|one|two|three|four|five|six|seven|eight|nine|ten)`

const date_src = dow => [
    String.raw`today|tomorrow|tmrw?|tmr|tom`,
    String.raw`next\s+(?:week|month|year)`,
    String.raw`this\s+weekend`,
    String.raw`(?:next|this)\s+${ DOW_SRC }`,
    String.raw`in\s+${ COUNT_SRC }\s+(?:days?|weeks?|months?|years?)`,
    String.raw`${ ORD_SRC }(?:\s+of)?\s+${ MONTH_SRC }(?:,?\s+\d{4})?`,
    String.raw`${ MONTH_SRC }\s+${ ORD_SRC }(?:,?\s+\d{4})?`,
    String.raw`\d{4}-\d{2}-\d{2}`,
    dow,
].map( source => `(?:${ source })` ).join( `|` )

const DATE_SRC = date_src( BARE_DOW_SRC )
const PREFIXED_DATE_SRC = date_src( DOW_SRC )
const TIME_SRC = String.raw`(?:noon|midnight|\d{1,2}(?::\d{2})?\s?(?:am|pm)|\d{1,2}:\d{2}|[01]\d[0-5]\d|2[0-3][0-5]\d|\d{1,2})`

// Deadline times: explicit forms always, bare hours only when valid (0–23, or HHMM)
const EXPLICIT_TIME_SRC = String.raw`(?:noon|midnight|(?:1[0-2]|0?[1-9])(?::[0-5]\d)?\s?(?:am|pm)|(?:[01]?\d|2[0-3]):[0-5]\d)`
const BARE_HOUR_SRC = String.raw`(?:[01]\d[0-5]\d|2[0-3][0-5]\d|[01]?\d|2[0-3])(?!\d)`

// `tom` means tomorrow, but capitalised `Tom` is a name ("Call Tom at 5")
const names_tom = phrase => /\bTom\b/.test( phrase )

const WORD_COUNTS = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 }

/* ---------------------------------------------------------------------------
   Phrase resolvers (pure; today + week start are inputs)
--------------------------------------------------------------------------- */

// Next calendar match of day/month on or after today (handles 29 Feb by waiting for a leap year)
const upcoming = ( month, day, today ) => {
    const { year } = parts_of( today )
    const valid_years = [ 0, 1, 2, 3, 4, 5, 6, 7, 8 ].map( k => year + k ).filter( y => day <= days_in_month( y, month ) )
    return valid_years.map( y => iso_of( y, month, day ) ).find( date => date >= today ) ?? null
}

const day_month = ( day, month_word, year_text, today ) => {
    const month = MONTHS.indexOf( month_word.slice( 0, 3 ) ) + 1
    const day_number = parseInt( day, 10 )
    if( !year_text ) return upcoming( month, day_number, today )
    const year = Number( year_text )
    return day_number <= days_in_month( year, month ) ? iso_of( year, month, day_number ) : null
}

const dow_of = word => WEEKDAYS.indexOf( word.slice( 0, 3 ) )
const count_of = word => WORD_COUNTS[ word ] ?? Number( word )

// [ regex, ( match, today, week_start ) => iso ], tried in order on the normalised phrase
const PHRASES = [
    [ /^today$/, ( _, today ) => today ],
    [ /^(?:tomorrow|tmrw?|tmr|tom)$/, ( _, today ) => add_days( today, 1 ) ],
    [ /^next week$/, ( _, today, week_start ) => add_days( start_of_week( today, week_start ), 7 ) ],
    [ /^next month$/, ( _, today ) => add_months( `${ today.slice( 0, 7 ) }-01`, 1 ) ],
    [ /^next year$/, ( _, today ) => `${ Number( today.slice( 0, 4 ) ) + 1 }-01-01` ],

    // Weekend = the coming Saturday, or today when it's already the weekend
    [ /^this weekend$/, ( _, today ) => [ 0, 6 ].includes( weekday_of( today ) ) ? today : add_days( today, 6 - weekday_of( today ) ) ],

    // `next fri` = Friday of next week; bare `fri` = the coming one, never today
    [ new RegExp( `^next (${ DOW_SRC })$` ), ( [ , day ], today, week_start ) => add_days( start_of_week( today, week_start ), 7 + ( dow_of( day ) - week_start + 7 ) % 7 ) ],
    [ new RegExp( `^(?:this )?(${ DOW_SRC })$` ), ( [ , day ], today ) => add_days( today, ( dow_of( day ) - weekday_of( today ) + 7 ) % 7 || 7 ) ],

    [ new RegExp( `^in (${ COUNT_SRC }) (day|week|month|year)s?$` ), ( [ , count, unit ], today ) => {
        if( unit === `day` ) return add_days( today, count_of( count ) )
        if( unit === `week` ) return add_days( today, count_of( count ) * 7 )
        return add_months( today, unit === `month` ? count_of( count ) : count_of( count ) * 12 )
    } ],

    [ new RegExp( `^(${ ORD_SRC })(?: of)? (${ MONTH_SRC })(?:,? (\\d{4}))?$` ), ( [ , day, month, year ], today ) => day_month( day, month, year, today ) ],
    [ new RegExp( `^(${ MONTH_SRC }) (${ ORD_SRC })(?:,? (\\d{4}))?$` ), ( [ , month, day, year ], today ) => day_month( day, month, year, today ) ],
    [ /^\d{4}-\d{2}-\d{2}$/, ( [ iso ] ) => iso ],
]

/**
 * Resolves a date phrase (with optional on/by/before prefix) to an ISO date
 * `fri` on a Friday means next week; `next fri` = Friday of next week; dates without a year are the next one to come
 * @param {string} phrase
 * @param {string} today - ISO date
 * @param {number} [week_start] - 0 = Sunday, 1 = Monday
 * @returns {string|null}
 */
export const resolve_date_phrase = ( phrase, today, week_start = 1 ) => {

    const text = phrase.trim().toLowerCase().replace( /\s+/g, ` ` ).replace( /^(?:on|by|before) /, `` )
    const hit = PHRASES.find( ( [ regex ] ) => regex.test( text ) )
    if( !hit ) return null

    const [ regex, resolve ] = hit
    const date = resolve( text.match( regex ), today, week_start )

    // A spelled-out year in the past is a reference ("since 3 Jan 2009"), not a plan
    return date && is_iso( date ) && !( /\d{4}/.test( text ) && date < today ) ? date : null
}

/**
 * Resolves a time phrase to 24h HH:MM
 * @param {string} phrase - `3pm`, `3:30 pm`, `15:00`, `noon`, `midnight` (optional leading `at`)
 * @returns {string|null}
 */
export const resolve_time_phrase = phrase => {
    const text = phrase.trim().toLowerCase().replace( /^at\s+/, `` )
    if( text === `noon` ) return `12:00`
    if( text === `midnight` ) return `00:00`

    // 24h `1500` / `0930` (only ever reached after `at`)
    const compact = text.match( /^([01]\d|2[0-3])([0-5]\d)$/ )
    if( compact ) return `${ compact[ 1 ] }:${ compact[ 2 ] }`

    const match = text.match( /^(\d{1,2})(?::(\d{2}))?\s?(am|pm)?$/ )
    if( !match ) return null
    const [ , hour_text, minute_text = `00`, meridiem ] = match
    const [ hour, minute ] = [ Number( hour_text ), Number( minute_text ) ]
    if( minute > 59 || hour > ( meridiem ? 12 : 23 ) || meridiem && hour === 0 ) return null

    // A bare `at 5` is the afternoon (nobody plans 05:00 without saying so); `at 05` / `at 7` / `at 18` are as written
    const bare_afternoon = !meridiem && !match[ 2 ] && /^[1-6]$/.test( hour_text )
    const hour_24 = meridiem ? hour % 12 + ( meridiem === `pm` ? 12 : 0 ) : bare_afternoon ? hour + 12 : hour
    return `${ String( hour_24 ).padStart( 2, `0` ) }:${ minute_text }`
}

/* ---------------------------------------------------------------------------
   Name matching for projects, labels, fields
--------------------------------------------------------------------------- */

const loose = name => `${ name }`.toLowerCase().replace( /[\s_-]+/g, ` ` ).trim()

// Projects as names, "Parent/Child" paths, or { id, name, parent_id } rows (paths derived; a full path beats a bare name)
const project_index = projects => {
    const rows = projects.map( project => typeof project === `string` ? { name: project } : project )
    const by_id = new Map( rows.filter( row => row.id ).map( row => [ row.id, row ] ) )
    const path_of = ( row, guard = 10 ) => {
        const parent = row.parent_id && by_id.get( row.parent_id )
        return parent && guard ? `${ path_of( parent, guard - 1 ) }/${ row.name }` : row.name
    }
    return rows.map( row => ( { id: row.id, name: row.name, keys: [ loose( row.name ), loose( path_of( row ) ) ] } ) )
}

const find_project = ( index, wanted ) => index.find( ( { keys } ) => keys[ 1 ] === loose( wanted ) ) || index.find( ( { keys } ) => keys.includes( loose( wanted ) ) )

const names_of = list => list.map( item => typeof item === `string` ? item : item.name )

/* ---------------------------------------------------------------------------
   Rules: earlier rules claim text first
--------------------------------------------------------------------------- */

// Trailing sentence punctuation isn't part of a #name / @name
const trim_name = name => name.replace( /[,.;:!?)]+$/, `` )
const QUOTED_NAME = String.raw`"([^"“”\n]+)["”]|“([^"“”\n]+)["”]`
const BARE_NAME = String.raw`([^\s#@"“”${ MASK }]+)`

// #name / @name: known → canonical name, unknown → offer create (but pure digits like #123 are issue refs, not names)
const named = ( type, match, { project_index: index, labels } ) => {
    const quoted = match[ 1 ] ?? match[ 2 ]
    const wanted = quoted ?? trim_name( match[ 3 ] )
    if( !wanted || !quoted && /^\d+$/.test( wanted ) ) return null

    if( type === `project` ) {
        const project = find_project( index, wanted )
        return project ? { value: project.name, ...project.id && { id: project.id } } : { value: wanted, unknown: true }
    }
    const known = labels.find( label => loose( label ) === loose( wanted ) )
    return known ? { value: known } : { value: wanted, unknown: true }
}

const RULES = [

    // Quoted literals claim first, so nothing inside quotes (#home, @Bob, today) ever parses.
    // Opening quote must start a token; an unclosed quote runs to the end (still typing)
    { type: `literal`, regex: new RegExp( String.raw`(?<=^|[\s(])["“]([^"“”\n]*)(?:["”]|$)`, `g` ), read: match => ( { value: match[ 1 ] } ) },

    { type: `project`, regex: new RegExp( `${ B }#(?:${ QUOTED_NAME }|${ BARE_NAME })`, `g` ), read: ( match, ctx ) => named( `project`, match, ctx ) },
    { type: `label`, regex: new RegExp( `${ B }@(?:${ QUOTED_NAME }|${ BARE_NAME })`, `g` ), read: ( match, ctx ) => named( `label`, match, ctx ) },

    { type: `recur`, regex: new RegExp( `${ B }every!?\\s+(?:${ RECUR_BODY_SRC })${ E }`, `gi` ), read: match => {
        const recur = parse_recur( match[ 0 ] )
        return recur.unparsed ? null : { value: recur }
    } },

    // A time right after the date belongs to the deadline: `by tom 16`, `by fri at 5pm`, `by fri 9:30`.
    // Bare hours (16, 0930) count only at the end or before more grammar, like `at 5` does ("by fri 3.50 cable", "at 5 shops" stay text)
    { type: `deadline`, regex: new RegExp( `${ B }(?:by|before)\\s+(?:${ PREFIXED_DATE_SRC })(?:\\s+(?:at\\s+)?(?<deadline_time>${ EXPLICIT_TIME_SRC }|(?:${ BARE_HOUR_SRC })(?=\\s*(?:$|[,;!?)#@!](?!\\d)|\\.(?!\\d)|p[1-4]\\b|every\\b))))?${ E }`, `gi` ), read: ( match, { today, week_start } ) => {
        if( names_tom( match[ 0 ] ) ) return null
        const [ phrase ] = match
        const time_text = match.groups?.deadline_time
        const time = time_text && resolve_time_phrase( time_text )
        const date = resolve_date_phrase( time_text ? phrase.slice( 0, phrase.lastIndexOf( time_text ) ).replace( /\s+at\s*$/i, `` ) : phrase, today, week_start )
        if( !date ) return null
        return { value: /^before/i.test( phrase ) ? add_days( date, -1 ) : date, ...time && { time } }
    } },

    // Bare `at 5` is flagged: it only counts at the end or right before other grammar (see drop_loose_hours)
    { type: `time`, regex: new RegExp( `${ B }(?:at\\s+${ TIME_SRC }|\\d{1,2}(?::\\d{2})?\\s?(?:am|pm))${ E }`, `gi` ), read: match => {
        const time = resolve_time_phrase( match[ 0 ] )
        return time && { value: time, .../^at\s+(?:\d{1,2}|\d{4})$/i.test( match[ 0 ] ) && { bare: true } }
    } },

    { type: `date`, regex: new RegExp( `${ B }(?:on\\s+(?:${ PREFIXED_DATE_SRC })|${ DATE_SRC })${ E }`, `gi` ), read: ( match, { today, week_start } ) => {
        if( names_tom( match[ 0 ] ) ) return null
        const date = resolve_date_phrase( match[ 0 ], today, week_start )
        return date && { value: date }
    } },

    { type: `priority`, regex: new RegExp( `${ B }(?:!|p)([1-4])(?=$|\\s)`, `gi` ), read: match => ( { value: Number( match[ 1 ] ) } ) },

    { type: `field`, regex: new RegExp( `${ B }([a-z][\\w-]*):(?:"([^"\\n]*)"|([^\\s"${ MASK }]+))`, `gi` ), read: ( match, { field_defs } ) => {
        const [ , name, quoted, bare ] = match
        const def = field_defs.find( field => loose( field.name ) === loose( name ) )
        if( !def ) return null
        const raw_value = trim_name( quoted ?? bare )
        const value = def.type === `number` ? Number( raw_value ) : raw_value
        if( def.type === `number` && Number.isNaN( value ) ) return null
        return { value: { name: def.name, value } }
    } },
]

/* ---------------------------------------------------------------------------
   Scanner
--------------------------------------------------------------------------- */

const URL_RX = /\b[a-z][a-z0-9+.-]*:\/\/\S+|\bwww\.\S+|\bmailto:\S+/gi
const MD_LINK_RX = /\[[^\]\n]*\]\([^)\s]*\)/g
const EMAIL_RX = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g

// Same-length mask (per UTF-16 unit) keeps indices aligned with the original text
const mask_text = ( text, extra_ranges ) => {
    const ranges = [ MD_LINK_RX, URL_RX, EMAIL_RX ]
        .flatMap( regex => [ ...text.matchAll( regex ) ].map( match => [ match.index, match.index + match[ 0 ].length ] ) )
        .concat( extra_ranges )
    if( !ranges.length ) return text
    return text.split( `` ).map( ( char, index ) => ranges.some( ( [ start, end ] ) => index >= start && index < end ) ? MASK : char ).join( `` )
}

// "Meet at 5 shops" / "at 5.50" are amounts, "Call tom at 5" / "at 5 tom" times: a bare hour must end the text
// (or clause) or touch another token; protected ranges count as tokens ("at 5 #NewProject" kept as written)
const drop_loose_hours = ( text, spans, literal_ranges ) => spans.filter( span => {
    if( !span.bare ) return true
    const rest = text.slice( span.end )
    const next_at = span.end + rest.length - rest.trimStart().length
    const touches = [ ...spans.map( ( { start } ) => start ), ...literal_ranges.map( ( [ start ] ) => start ) ].includes( next_at )
    return !rest.trim() || /^[,.;!?)](?!\d)/.test( rest ) || touches
} ).map( ( { bare, ...span } ) => span )

// Run every rule over the masked text; first claim wins, overlaps are skipped
const scan = ( text, ctx, literal_ranges ) => {

    const masked = mask_text( text, literal_ranges )
    const spans = []
    const free = ( start, end ) => !spans.some( span => start < span.end && end > span.start )

    RULES.forEach( ( { type, regex, read } ) => [ ...masked.matchAll( regex ) ].forEach( match => {
        const [ start, end ] = [ match.index, match.index + match[ 0 ].length ]
        if( match[ 0 ].includes( MASK ) || !free( start, end ) ) return
        const result = read( match, ctx )
        if( result ) spans.push( { type, start, end, raw: text.slice( start, end ), ...result } )
    } ) )

    return drop_loose_hours( text, spans.sort( ( a, b ) => a.start - b.start ), literal_ranges )
}

/* ---------------------------------------------------------------------------
   Title assembly
--------------------------------------------------------------------------- */

// Removed tokens leave one space where they were; everything else is kept byte-for-byte
const build_title = ( text, removed, kept_literals, literal_ranges ) => {

    let title = ``
    let gap = false
    const masks = []

    const append = ( chunk, origin ) => {
        const body = gap ? chunk.trimStart() : chunk
        if( !body ) return
        const lead = chunk.length - body.length
        if( gap && title ) title += ` `
        const at = title.length

        // Caller-kept ranges inside this chunk map straight across
        literal_ranges
            .filter( ( [ start, end ] ) => start >= origin + lead && end <= origin + chunk.length )
            .forEach( ( [ start, end ] ) => masks.push( [ at + start - origin - lead, at + end - origin - lead ] ) )

        title += body
        gap = false
    }

    const events = [ ...removed.map( span => ( { ...span, removed: true } ) ), ...kept_literals ].sort( ( a, b ) => a.start - b.start )
    const cursor = events.reduce( ( position, span ) => {
        append( text.slice( position, span.start ), position )
        if( span.removed ) {
            title = title.trimEnd()
            gap = true
        } else {
            // Protecting literal: inner text kept, quotes dropped, range remembered for literal_mask
            const before = title.length + ( gap && title ? 1 : 0 )
            append( span.value, span.start + 1 )
            if( span.value ) masks.push( [ before, before + span.value.trimStart().length ] )
        }
        return span.end
    }, 0 )
    append( text.slice( cursor ), cursor )

    const lead = title.length - title.trimStart().length
    const trimmed = title.trim()
    const literal_mask = masks.map( ( [ start, end ] ) => [ start - lead, Math.min( end - lead, trimmed.length ) ] ).filter( ( [ start, end ] ) => end > start )

    return { title: trimmed, literal_mask }
}

const SINGLE = [ `date`, `deadline`, `time`, `recur`, `priority`, `project` ]

/**
 * Parses quick-add text into a task + highlight spans
 * @param {string} text
 * @param {object} options
 * @param {string} options.today - ISO date
 * @param {number} [options.week_start] - 0 = Sunday, 1 = Monday
 * @param {string} [options.now] - HH:MM wall clock; a bare past time today then means tomorrow
 * @param {Array<string|object>} [options.projects] - names, `Parent/Child` paths, or { id, name, parent_id }
 * @param {Array<string|object>} [options.labels] - names or { name }
 * @param {Array<string|object>} [options.field_defs] - names or { name, type: `text`|`number` }
 * @param {Array<[number, number]>} [options.literal_ranges] - input ranges kept verbatim in the title ("Keep as title")
 * @returns {{ task: object, spans: object[] }} spans carry type, start, end, raw, value (+ unknown / conflict);
 *   a project matched from a row also sets task.project_id (span.id)
 */
export const parse_quick_add = ( text = ``, { today, week_start = 1, now, projects = [], labels = [], field_defs = [], literal_ranges = [] } = {} ) => {

    const ctx = {
        today, week_start,
        project_index: project_index( projects ),
        labels: names_of( labels ),
        field_defs: field_defs.map( field => typeof field === `string` ? { name: field } : field ),
    }

    // Quoted runs only earn literal treatment (quotes dropped) when they hide grammar; otherwise they're plain title text
    const protects = inner => !!inner.trim() && scan( inner, ctx, [] ).some( span => span.type !== `literal` )
    const spans = scan( text, ctx, literal_ranges ).filter( span => span.type !== `literal` || protects( span.value ) )

    // Repeated single-valued tokens: last wins, all get flagged
    const counts = spans.reduce( ( tally, { type, value } ) => {
        const key = type === `field` ? `field:${ value.name }` : type
        return { ...tally, [ key ]: ( tally[ key ] || 0 ) + 1 }
    }, {} )
    const flagged = spans.map( span => {
        const key = span.type === `field` ? `field:${ span.value.name }` : span.type
        return ( SINGLE.includes( span.type ) || span.type === `field` ) && counts[ key ] > 1 ? { ...span, conflict: true } : span
    } )

    // Fold spans into the task, in reading order
    const blank = { title: ``, scheduled: null, deadline: null, deadline_time: null, time: null, priority: null, project: null, labels: [], recur: null, fields: {} }
    const folded = flagged.filter( span => !span.unknown && span.type !== `literal` ).reduce( ( task, { type, value, id, time } ) => {
        if( type === `date` ) return { ...task, scheduled: value }
        if( type === `project` ) return { ...task, project: value, project_id: id ?? null } // last wins, id included
        if( type === `deadline` ) return { ...task, deadline: value, deadline_time: time ?? null }
        if( type === `label` ) return { ...task, labels: [ ...new Set( [ ...task.labels, value ] ) ] }
        if( type === `field` ) return { ...task, fields: { ...task.fields, [ value.name ]: value.value } }
        return { ...task, [ type ]: value }
    }, blank )

    // Implied dates: a series starts on its first occurrence; a bare time means today (or tomorrow once it's passed)
    const implied_start = !folded.scheduled && folded.recur ? first_occurrence( folded.recur, today ) : folded.scheduled
    const timed_start = !implied_start && folded.time ? today : implied_start
    const passed = !folded.scheduled && folded.time && now && timed_start === today && folded.time <= now
    const scheduled = passed ? folded.recur ? next_occurrence( anchor_recur( folded.recur, today ), today ) : add_days( today, 1 ) : timed_start
    const recur = folded.recur && anchor_recur( folded.recur, scheduled )

    const removed = flagged.filter( span => span.type !== `literal` )
    const kept_literals = flagged.filter( span => span.type === `literal` )
    const { title, literal_mask } = build_title( text, removed, kept_literals, literal_ranges )

    const task = { ...folded, title, scheduled: scheduled ?? null, recur: recur ?? null, ...literal_mask.length && { literal_mask } }
    return { task, spans: flagged }
}
