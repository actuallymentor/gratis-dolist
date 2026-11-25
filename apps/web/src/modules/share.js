/**
 * Text shared from another app (Web Share Target, GET): title + text + url, deduplicated (apps often repeat
 * the title or URL inside `text`), quoted so a stray # or @ in it stays part of the title.
 * @param {URLSearchParams} params
 * @returns {string} quick-add text, or `` when nothing was shared
 */
export const shared_text = params => {

    const parts = [ `title`, `text`, `url` ].map( key => params.get( key )?.trim() ).filter( Boolean )

    // Drop a part that another part already contains (first one wins on exact repeats)
    const unique = parts.filter( ( part, i ) => !parts.some( ( other, j ) => j !== i && ( other === part ? j < i : other.includes( part ) ) ) )
    if( !unique.length ) return ``

    const link = unique.find( part => /^https?:\/\/\S+$/.test( part ) )
    const words = unique.filter( part => part !== link ).join( ` ` ).replace( /"/g, `'` )
    return [ words && `"${ words }"`, link ].filter( Boolean ).join( ` ` )
}
