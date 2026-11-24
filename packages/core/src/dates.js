// Floating calendar dates (YYYY-MM-DD) as day numbers on a UTC axis.
// UTC has no DST, so day maths never drifts by an hour (plan §2.4). Nothing here reads the clock.

const DAY_MS = 86_400_000

export const WEEKDAYS = [ `sun`, `mon`, `tue`, `wed`, `thu`, `fri`, `sat` ]
export const MONTHS = [ `jan`, `feb`, `mar`, `apr`, `may`, `jun`, `jul`, `aug`, `sep`, `oct`, `nov`, `dec` ]

const pad = ( n, width = 2 ) => String( n ).padStart( width, `0` )

/**
 * Splits an ISO date into numbers
 * @param {string} iso - YYYY-MM-DD (anything after the date part is ignored)
 * @returns {{ year: number, month: number, day: number }} month is 1–12
 */
export const parts_of = iso => {
    const [ year, month, day ] = iso.slice( 0, 10 ).split( `-` ).map( Number )
    return { year, month, day }
}

/** Integer day number → ISO date */
export const to_iso = days => new Date( days * DAY_MS ).toISOString().slice( 0, 10 )

export const days_in_month = ( year, month ) => new Date( Date.UTC( year, month, 0 ) ).getUTCDate()

/** Builds an ISO date from numbers, normalising overflow (month 13 → next January) */
export const iso_of = ( year, month, day ) => to_iso( Date.UTC( year, month - 1, day ) / DAY_MS )

/** ISO date → integer day number (days since 1970-01-01) */
export const to_days = iso => {
    const { year, month, day } = parts_of( iso )
    return Date.UTC( year, month - 1, day ) / DAY_MS
}

/** True for a real calendar date in YYYY-MM-DD form */
export const is_iso = iso => {
    if( !/^\d{4}-\d{2}-\d{2}$/.test( iso || `` ) ) return false
    const { year, month, day } = parts_of( iso )
    return month >= 1 && month <= 12 && day >= 1 && day <= days_in_month( year, month )
}

export const add_days = ( iso, n ) => to_iso( to_days( iso ) + n )
export const diff_days = ( later, earlier ) => to_days( later ) - to_days( earlier )

/** 0 = Sunday … 6 = Saturday */
export const weekday_of = iso => ( to_days( iso ) + 4 ) % 7

/**
 * Same day-of-month n months later, clamped to the month's last day (31 Jan + 1 month = 28/29 Feb)
 * @param {string} iso
 * @param {number} n - months, may be negative
 * @param {number} [day] - preferred day of month (defaults to iso's day); clamping never loses it
 */
export const add_months = ( iso, n, day ) => {
    const { year, month, day: own_day } = parts_of( iso )
    const index = year * 12 + month - 1 + n
    const [ next_year, next_month ] = [ Math.floor( index / 12 ), index % 12 + 1 ]
    return iso_of( next_year, next_month, Math.min( day ?? own_day, days_in_month( next_year, next_month ) ) )
}

export const start_of_week = ( iso, week_start = 1 ) => add_days( iso, -( ( weekday_of( iso ) - week_start + 7 ) % 7 ) )
export const end_of_week = ( iso, week_start = 1 ) => add_days( start_of_week( iso, week_start ), 6 )

export const start_of_month = iso => `${ iso.slice( 0, 7 ) }-01`
export const end_of_month = iso => {
    const { year, month } = parts_of( iso )
    return iso_of( year, month, days_in_month( year, month ) )
}

export const end_of_quarter = iso => {
    const { year, month } = parts_of( iso )
    const last_month = Math.ceil( month / 3 ) * 3
    return iso_of( year, last_month, days_in_month( year, last_month ) )
}

/**
 * Wall-clock date + time of an instant in a zone
 * @param {Date} instant
 * @param {string} time_zone - IANA zone
 * @returns {{ date: string, time: string }} YYYY-MM-DD and HH:MM
 */
export const wall_clock = ( instant, time_zone ) => {
    const format = new Intl.DateTimeFormat( `en-CA`, {
        timeZone: time_zone, hourCycle: `h23`,
        year: `numeric`, month: `2-digit`, day: `2-digit`, hour: `2-digit`, minute: `2-digit`,
    } )
    const bits = Object.fromEntries( format.formatToParts( instant ).map( ( { type, value } ) => [ type, value ] ) )
    return { date: `${ bits.year }-${ bits.month }-${ bits.day }`, time: `${ bits.hour }:${ bits.minute }` }
}

/**
 * The local calendar date of an instant, in an IANA zone or the runtime's zone
 * @param {Date} [instant]
 * @param {string} [time_zone] - e.g. `Europe/Amsterdam`; omitted = runtime local
 * @returns {string} ISO date
 */
export const today_iso = ( instant = new Date(), time_zone ) => {
    if( !time_zone ) return `${ instant.getFullYear() }-${ pad( instant.getMonth() + 1 ) }-${ pad( instant.getDate() ) }`
    return wall_clock( instant, time_zone ).date
}

const capitalise = text => text.charAt( 0 ).toLocaleUpperCase() + text.slice( 1 )

/**
 * Human short label for a floating date, relative to today
 * "Today" / "Tomorrow" / "Yesterday", weekday within the coming week, else "12 Nov" (+ year when ≥ ~6 months away)
 * @param {string} iso
 * @param {string} today - ISO date
 * @param {{ locale?: string }} [options] - BCP 47 locale for names (default en-GB → "12 Nov")
 * @returns {string}
 */
export const resolve_date_label = ( iso, today, { locale = `en-GB` } = {} ) => {

    if( !iso ) return ``
    const days = diff_days( iso, today )
    const utc = new Date( to_days( iso ) * DAY_MS )

    // Relative words come from Intl so they follow the locale
    if( Math.abs( days ) <= 1 ) return capitalise( new Intl.RelativeTimeFormat( locale, { numeric: `auto` } ).format( days, `day` ) )
    if( days > 1 && days < 7 ) return new Intl.DateTimeFormat( locale, { weekday: `short`, timeZone: `UTC` } ).format( utc )

    const far = Math.abs( days ) >= 183
    return new Intl.DateTimeFormat( locale, { day: `numeric`, month: `short`, ...far && { year: `numeric` }, timeZone: `UTC` } ).format( utc )
}
