import { useEffect, useState } from 'react'

const iso_today = () => new Date().toLocaleDateString( `sv` )

/**
 * Today's floating ISO date (YYYY-MM-DD) that rolls over at local midnight
 * and on resume (installed PWAs sleep through midnight without firing timers).
 */
export const use_today = () => {

    const [ today, set_today ] = useState( iso_today )

    useEffect( () => {

        const refresh = () => set_today( iso_today() )

        // Next local midnight, plus a second of slack
        const now = new Date()
        const midnight = new Date( now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1 )
        const timer = setTimeout( refresh, midnight - now )

        document.addEventListener( `visibilitychange`, refresh )
        window.addEventListener( `focus`, refresh )

        return () => {
            clearTimeout( timer )
            document.removeEventListener( `visibilitychange`, refresh )
            window.removeEventListener( `focus`, refresh )
        }

    }, [ today ] )

    return today
}
