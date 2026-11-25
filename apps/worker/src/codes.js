// Random secrets and their at-rest hashes. All codes are high-entropy, so a plain SHA-256 suffices (no KDF).

const ALPHABET = `ABCDEFGHJKMNPQRSTVWXYZ0123456789` // Crockford-ish: no I, L, O, U

/**
 * Random code in an unambiguous base32 alphabet, grouped for reading aloud.
 * @param {number} bits - entropy, rounded up to whole characters (5 bits each)
 * @returns {string} e.g. `K7QM-3XZP-…`
 */
export const random_code = bits => {
    const length = Math.ceil( bits / 5 )
    const bytes = crypto.getRandomValues( new Uint8Array( length ) )
    const chars = [ ...bytes ].map( byte => ALPHABET[ byte % 32 ] ).join( `` )
    return chars.match( /.{1,4}/g ).join( `-` )
}

/**
 * Normalizes typed codes: case, spaces, dashes and look-alike letters don't matter.
 * @param {string} code
 * @returns {string}
 */
export const normalize_code = code => String( code ?? `` )
    .toUpperCase()
    .replace( /[\s-]/g, `` )
    .replace( /O/g, `0` )
    .replace( /[IL]/g, `1` )

// 256-bit opaque token (session cookies)
export const random_token = () => {
    const bytes = crypto.getRandomValues( new Uint8Array( 32 ) )
    return btoa( String.fromCharCode( ...bytes ) ).replace( /\+/g, `-` ).replace( /\//g, `_` ).replace( /=+$/, `` )
}

/**
 * SHA-256 hex of a string.
 * @param {string} text
 * @returns {Promise<string>}
 */
export const sha256 = async text => {
    const digest = await crypto.subtle.digest( `SHA-256`, new TextEncoder().encode( text ) )
    return [ ...new Uint8Array( digest ) ].map( byte => byte.toString( 16 ).padStart( 2, `0` ) ).join( `` )
}
