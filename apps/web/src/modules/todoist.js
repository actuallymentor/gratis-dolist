const BASE = `https://api.todoist.com/api/v1`

/**
 * Read-only Todoist export, straight from the browser (Todoist allows CORS).
 * The token goes only to api.todoist.com, is never stored, and never appears in errors (plan §4).
 * @returns {Promise<{ projects, sections, labels, tasks }>} raw Todoist shapes, for core's from_todoist
 */
export const fetch_todoist = async token => {

    const get = async ( path, params ) => {
        const url = new URL( `${ BASE }${ path }` )
        Object.entries( params ).forEach( ( [ key, value ] ) => value != null && url.searchParams.set( key, value ) )
        const res = await fetch( url, { redirect: `error`, headers: { Authorization: `Bearer ${ token }` } } ).catch( () => null )
        if( !res ) throw new Error( `Couldn't reach Todoist. Check your connection.` )
        if( res.status === 401 || res.status === 403 ) throw new Error( `Todoist rejected that token.` )
        if( !res.ok ) throw new Error( `Todoist answered ${ res.status }.` )
        return res.json()
    }

    // Follow next_cursor until exhausted
    const all = async path => {
        const items = []
        let cursor = null
        do {
            const page = await get( path, { limit: 200, cursor } )
            items.push( ...Array.isArray( page ) ? page : page.results || [] )
            cursor = Array.isArray( page ) ? null : page.next_cursor
        } while( cursor )
        return items
    }

    const [ projects, sections, labels, tasks ] = await Promise.all( [ `/projects`, `/sections`, `/labels`, `/tasks` ].map( all ) )
    return { projects, sections, labels, tasks }
}

// Offer JSON (string or value) as a file download
export const download_json = ( filename, data ) => {
    const text = typeof data === `string` ? data : JSON.stringify( data, null, 2 )
    const url = URL.createObjectURL( new Blob( [ text ], { type: `application/json` } ) )
    const link = Object.assign( document.createElement( `a` ), { href: url, download: filename } )
    link.click()
    setTimeout( () => URL.revokeObjectURL( url ), 1_000 )
}
