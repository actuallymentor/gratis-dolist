// Recurrence rules (plan §2.3): one task row + completion rows, rules as plain JSON.
//
// recur = {
//   freq: `day`|`week`|`month`|`year`, interval: n,
//   by_day?: [ 0–6 ]          weekly weekdays (0 = Sunday)
//   month_day?: 1–31          monthly / yearly day; 31 = last day in short months
//   nth?: { n: 1–4|-1, dow }  monthly "1st saturday" / "last friday"
//   month?: 1–12              yearly month
//   anchor: `schedule`|`completion`, raw: `every …`
// }
// Rules we can't read stay verbatim: { raw, unparsed: true }

import { WEEKDAYS, MONTHS, add_days, add_months, days_in_month, diff_days, iso_of, parts_of, start_of_week, weekday_of } from './dates.js'

/* ---------------------------------------------------------------------------
   Phrase grammar, shared with the quick-add parser
--------------------------------------------------------------------------- */

export const DOW_SRC = String.raw`(?:mon(?:day)?|tue(?:s(?:day)?)?|wed(?:nesday)?|thu(?:r(?:s(?:day)?)?)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)`
export const MONTH_SRC = String.raw`(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)`
export const ORD_SRC = String.raw`(?:[12]\d|3[01]|0?[1-9])(?:st|nd|rd|th)?`

const NTH_SRC = `(?:1st|2nd|3rd|4th|first|second|third|fourth|last)`
const ON_DAY_SRC = String.raw`(?:\s+on\s+(?:the\s+)?(?:${ ORD_SRC }|last(?:\s+day)?))?`
const DOW_LIST_SRC = String.raw`${ DOW_SRC }s?(?:(?:\s*,\s*|\s+and\s+|\s*,\s*and\s+)${ DOW_SRC }s?)*`

// Alternation order matters: JS takes the first alternative that matches, so specific before general
export const RECUR_BODY_SRC = [
    String.raw`(?:\d{1,3}|other)\s+(?:days?|weeks?|months?|years?)${ ON_DAY_SRC }`,
    String.raw`${ NTH_SRC }\s+${ DOW_SRC }`,
    String.raw`${ ORD_SRC }(?:\s+of)?\s+${ MONTH_SRC }`,
    String.raw`${ MONTH_SRC }\s+${ ORD_SRC }`,
    String.raw`(?:day|week|month|year)${ ON_DAY_SRC }`,
    String.raw`(?:weekday|workday|weekend)s?`,
    DOW_LIST_SRC,
    String.raw`last\s+day`,
    ORD_SRC,
].map( source => `(?:${ source })` ).join( `|` )

const dow_index = word => WEEKDAYS.indexOf( word.slice( 0, 3 ) )
const month_index = word => MONTHS.indexOf( word.slice( 0, 3 ) ) + 1
const ordinal = word => ( { first: 1, second: 2, third: 3, fourth: 4, last: -1 } )[ word ] ?? parseInt( word, 10 )
const interval_of = word => word === `other` ? 2 : Number( word )
const day_of = phrase => /last/.test( phrase ) ? 31 : parseInt( phrase, 10 )

// Yearly on a fixed date; 31 Feb style nonsense is rejected
const yearly = ( month, month_day ) => month_day <= days_in_month( 2000, month ) ? { freq: `year`, month, month_day } : null

// Body interpreters, tried in order; each returns rule fields or nothing
const BODIES = [
    [ new RegExp( String.raw`^(\d{1,3}|other)\s+(day|week|month|year)s?(?:\s+on\s+(?:the\s+)?(.+))?$` ), ( [ , n, freq, on ] ) => {
        if( on && freq !== `month` ) return null
        return { freq, interval: interval_of( n ), ...on && { month_day: day_of( on ) } }
    } ],
    [ new RegExp( String.raw`^(${ NTH_SRC })\s+(${ DOW_SRC })$` ), ( [ , nth, dow ] ) => ( { freq: `month`, nth: { n: ordinal( nth ), dow: dow_index( dow ) } } ) ],
    [ new RegExp( String.raw`^(${ ORD_SRC })(?:\s+of)?\s+(${ MONTH_SRC })$` ), ( [ , day, month ] ) => yearly( month_index( month ), parseInt( day, 10 ) ) ],
    [ new RegExp( String.raw`^(${ MONTH_SRC })\s+(${ ORD_SRC })$` ), ( [ , month, day ] ) => yearly( month_index( month ), parseInt( day, 10 ) ) ],
    [ /^(day|week|month|year)(?:\s+on\s+(?:the\s+)?(.+))?$/, ( [ , freq, on ] ) => {
        if( on && freq !== `month` ) return null
        return { freq, ...on && { month_day: day_of( on ) } }
    } ],
    [ /^(?:weekday|workday)s?$/, () => ( { freq: `week`, by_day: [ 1, 2, 3, 4, 5 ] } ) ],
    [ /^weekends?$/, () => ( { freq: `week`, by_day: [ 0, 6 ] } ) ],
    [ new RegExp( `^${ DOW_LIST_SRC }$` ), ( [ list ] ) => {
        const days = list.match( new RegExp( DOW_SRC, `g` ) ).map( dow_index )
        return { freq: `week`, by_day: [ ...new Set( days ) ].sort() }
    } ],
    [ /^last\s+day$/, () => ( { freq: `month`, month_day: 31 } ) ],
    [ new RegExp( `^${ ORD_SRC }$` ), ( [ day ] ) => ( { freq: `month`, month_day: parseInt( day, 10 ) } ) ],
]

/**
 * Reads a recurrence phrase: `every …`, `every! …` (completion-anchored), or `daily|weekly|monthly|yearly|annually [date]`
 * A trailing `at <time>` / `starting today` style tail is not part of the rule; tails we don't know make it unparsed.
 * @param {string} phrase
 * @returns {object} recur rule, or { raw, unparsed: true }
 */
export const parse_recur = phrase => {

    const raw = `${ phrase ?? `` }`.trim()
    const text = raw.toLowerCase().replace( /\s+/g, ` ` ).replace( /\s+at\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?$/, `` )

    // Normalise the head into `every[!] <body>`
    const head = text.match( /^(every!?|daily|weekly|monthly|yearly|annually)(?:\s+(.*))?$/ )
    if( !head ) return { raw, unparsed: true }

    const [ , word, rest = `` ] = head
    const anchor = word === `every!` ? `completion` : `schedule`
    const implied = { daily: `day`, weekly: `week`, monthly: `month`, yearly: `year`, annually: `year` }[ word ]

    // `yearly jan 1` / `monthly on the 3rd` → reuse the every-grammar
    const body = implied && rest ? rest.replace( /^on\s+(?:the\s+)?/, `` ) : implied || rest
    const [ regex, read ] = BODIES.find( ( [ pattern ] ) => pattern.test( body ) ) || []
    const rule = regex && read( body.match( regex ) )
    if( !rule ) return { raw, unparsed: true }

    // `monthly 3rd`, `yearly jan 1`, `weekly on mon`: the body must agree with the implied frequency
    if( implied && rule.freq !== implied ) return { raw, unparsed: true }

    return { interval: 1, ...rule, anchor, raw }
}

/* ---------------------------------------------------------------------------
   Occurrence maths
--------------------------------------------------------------------------- */

export const is_recurring = task => !!task?.recur && !task.recur.unparsed

// The nth (1–4) or last (-1) weekday of a month
const nth_weekday = ( year, month, { n, dow } ) => {
    if( n === -1 ) {
        const last = iso_of( year, month, days_in_month( year, month ) )
        return add_days( last, -( ( weekday_of( last ) - dow + 7 ) % 7 ) )
    }
    const first = iso_of( year, month, 1 )
    const day = 1 + ( dow - weekday_of( first ) + 7 ) % 7 + 7 * ( n - 1 )
    return day <= days_in_month( year, month ) ? iso_of( year, month, day ) : null
}

/**
 * Pins the parts a rule leaves open to a start date, so month-end clamping can't drift (31 Jan → 28 Feb → 31 Mar)
 * Completion-anchored rules stay open: `every! month` means one month after you finish.
 * @param {object} recur
 * @param {string} start - ISO date of the first occurrence
 */
export const anchor_recur = ( recur, start ) => {
    if( !is_recurring( { recur } ) || recur.anchor === `completion` || !start ) return recur
    const { month, day } = parts_of( start )
    if( recur.freq === `week` && !recur.by_day?.length ) return { ...recur, by_day: [ weekday_of( start ) ] }
    if( recur.freq === `month` && !recur.nth && !recur.month_day ) return { ...recur, month_day: day }
    if( recur.freq === `year` && !recur.month ) return { ...recur, month, month_day: recur.month_day ?? day }
    return recur
}

/**
 * The first rule date strictly after `from_iso`, treating from as the previous occurrence
 * Intervals count from `from` (every 2 weeks = from + 2 weeks). Week alignment uses Monday starts.
 * @param {object} recur
 * @param {string} from_iso
 * @returns {string|null} ISO date, null for unparsed rules
 */
export const next_occurrence = ( recur, from_iso ) => {

    if( !is_recurring( { recur } ) ) return null
    const step = recur.interval || 1
    const { year, month, day } = parts_of( from_iso )

    if( recur.freq === `day` ) return add_days( from_iso, step )

    if( recur.freq === `week` ) {

        // Offsets of the rule's weekdays inside a Monday-start week
        const week = start_of_week( from_iso, 1 )
        const offsets = ( recur.by_day?.length ? recur.by_day : [ weekday_of( from_iso ) ] ).map( dow => ( dow + 6 ) % 7 ).sort()

        const later_this_week = offsets.map( offset => add_days( week, offset ) ).find( date => date > from_iso )
        return later_this_week || add_days( week, 7 * step + offsets[ 0 ] )
    }

    if( recur.freq === `month` ) {

        // Same month first (only hits when from is off-pattern), else jump the interval
        const pick = ( y, m ) => recur.nth ? nth_weekday( y, m, recur.nth ) : iso_of( y, m, Math.min( recur.month_day ?? day, days_in_month( y, m ) ) )
        const same = pick( year, month )
        if( same && same > from_iso ) return same

        const jumps = [ 1, 2, 3, 4 ].map( k => parts_of( add_months( `${ from_iso.slice( 0, 7 ) }-01`, step * k ) ) )
        return jumps.map( ( { year: y, month: m } ) => pick( y, m ) ).find( Boolean ) ?? null
    }

    if( recur.freq === `year` ) {
        const target_month = recur.month ?? month
        const target_day = recur.month_day ?? day
        const pick = y => iso_of( y, target_month, Math.min( target_day, days_in_month( y, target_month ) ) )
        const same = pick( year )
        return same > from_iso ? same : pick( year + step )
    }

    return null
}

/**
 * The first rule date on or after a day (interval ignored; it's where a series starts)
 * @param {object} recur
 * @param {string} on_or_after - ISO date
 */
export const first_occurrence = ( recur, on_or_after ) => {
    if( !is_recurring( { recur } ) ) return null
    const anchored = anchor_recur( { ...recur, anchor: `schedule` }, on_or_after )
    return next_occurrence( { ...anchored, interval: 1 }, add_days( on_or_after, -1 ) )
}

const occurrence_of = completion => typeof completion === `string` ? completion : completion?.occurrence

/**
 * The occurrence a recurring task currently shows: its scheduled date, skipping occurrences already completed
 * (completions written offline by two devices share a key, so this never double-advances)
 * @param {object} task - { scheduled, deadline, recur }
 * @param {Array<string|{ occurrence: string }>} completions_for_task
 * @param {string} today - ISO date, used when the series has no date yet
 * @returns {string|null} ISO date
 */
export const current_occurrence = ( task, completions_for_task = [], today ) => {

    const base = task.scheduled ?? task.deadline ?? null
    if( !is_recurring( task ) ) return base

    const done = new Set( completions_for_task.map( occurrence_of ) )
    const start = base ?? first_occurrence( task.recur, today )

    // Bounded walk past completed occurrences
    const walk = ( date, guard ) => !done.has( date ) || !guard ? date : walk( next_occurrence( task.recur, date ), guard - 1 )
    return walk( start, 1_000 )
}

/**
 * What completing (or skipping) an occurrence writes
 * - Non-recurring: { patch: { completed_at } }
 * - Recurring: a completion row + the task moved to its next occurrence. Schedule-anchored rules never land
 *   in the past (no pile-up); `every!` counts from today. A deadline keeps its offset from the scheduled date.
 * @param {object} task - { id, scheduled, deadline, recur }
 * @param {string} occurrence - ISO date being completed
 * @param {string} today - ISO date
 * @param {{ skipped?: boolean, at?: string|number }} [options] - at = completion timestamp (defaults to today)
 * @returns {{ patch: object, completion: { key: string, occurrence: string, skipped: boolean, at } | null }}
 */
export const complete_patch = ( task, occurrence, today, { skipped = false, at = today } = {} ) => {

    if( !is_recurring( task ) ) return { patch: { completed_at: at }, completion: null }

    const { recur } = task
    const field = task.scheduled || !task.deadline ? `scheduled` : `deadline`

    // Schedule anchor: step from the occurrence, then skip anything already behind us
    const step_past_today = date => date && date < today ? step_past_today( next_occurrence( recur, date ) ) : date
    const next = recur.anchor === `completion`
        ? next_occurrence( recur, today )
        : step_past_today( next_occurrence( recur, occurrence ) )

    // Deadline rides along at the same distance from the scheduled date
    const offset = field === `scheduled` && task.scheduled && task.deadline
        ? diff_days( task.deadline, task.scheduled )
        : null

    const patch = { [ field ]: next, ...offset !== null && { deadline: add_days( next, offset ) } }
    const completion = { key: `${ task.id }:${ occurrence }`, occurrence, skipped, at }

    return { patch, completion }
}
