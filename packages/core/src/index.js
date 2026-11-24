// @dolist/core: pure, platform-free domain logic (grammar, dates, recurrence, filters, recipes).
// Filled from M1 on; see docs/IMPLEMENTATION_PLAN.md §2.

/**
 * Which rolling Horizons lane a task belongs to, by its soonest date (plan §7.1).
 * @param {{ scheduled?: string, deadline?: string }} task - ISO dates (YYYY-MM-DD), floating
 * @param {string} today - ISO date
 * @returns {`overdue`|`today`|`week`|`month`|`quarter`|`later`|null}
 */
export const horizon_of = ( { scheduled, deadline }, today ) => {

    const [ soonest ] = [ scheduled, deadline ].filter( Boolean ).sort()
    if( !soonest ) return null

    const days = ( Date.parse( soonest ) - Date.parse( today ) ) / 86_400_000
    if( days < 0 ) return `overdue`
    if( days < 1 ) return `today`
    if( days < 7 ) return `week`
    if( days < 31 ) return `month`
    if( days < 92 ) return `quarter`
    return `later`
}
