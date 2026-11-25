/**
 * A task from content shared by another app (Web Share Target, GET). Never parsed as quick-add grammar:
 * shared prose is data, so `#home tomorrow` stays words. Title = the share's title or first line of text;
 * everything else (remaining lines, the link) becomes notes. Apps often repeat the link inside `text`,
 * so a part is dropped only when it appears as a whole word elsewhere.
 * @param {URLSearchParams} params
 * @returns {{ title: string, notes: string }|null}
 */
export const shared_task = params => {

    const get = key => params.get( key )?.replace( /\r\n?/g, `\n` ).trim() || ``
    const shared_title = get( `title` )
    const lines = get( `text` ).split( `\n` ).map( line => line.trim() ).filter( Boolean )
    const url = get( `url` )

    const title = ( shared_title || lines[ 0 ] || url ).replace( /\s+/g, ` ` ).slice( 0, 300 )
    if( !title ) return null

    const has_word = ( haystack, needle ) => haystack.split( /\s+/ ).includes( needle )
    const rest = lines.filter( ( line, index ) => !( index === 0 && !shared_title ) && line !== title )
    const all_text = [ title, ...rest ].join( ` ` )
    const notes = [ ...rest, url && !has_word( all_text, url ) ? url : `` ].filter( Boolean ).join( `\n` )

    return { title, notes }
}
