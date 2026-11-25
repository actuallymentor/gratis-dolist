import { DurableObject } from 'cloudflare:workers'
import {
    generateAuthenticationOptions,
    generateRegistrationOptions,
    verifyAuthenticationResponse,
    verifyRegistrationResponse,
} from '@simplewebauthn/server'
import { normalize_code, random_code, random_token, sha256 } from './codes.js'

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const LINK_TTL = 15 * MINUTE
const CHALLENGE_TTL = 5 * MINUTE
const CODE_ATTEMPTS = 5          // wrong codes per email link before it dies
const FAILURE_WINDOW = 10 * MINUTE
const MAX_FAILURES = 20          // per source address
const MAX_FAILURES_ALL = 2_000   // all sources: bounds the table
const LINKS_PER_EMAIL = 5        // per hour
const LINKS_PER_SOURCE = 20      // per hour
const LAST_SEEN_EVERY = 5 * MINUTE

const SCHEMA = `
    CREATE TABLE IF NOT EXISTS users ( id TEXT PRIMARY KEY, email TEXT UNIQUE, created INTEGER NOT NULL );
    CREATE TABLE IF NOT EXISTS sessions ( id TEXT PRIMARY KEY, user_id TEXT NOT NULL, token_hash TEXT UNIQUE NOT NULL, label TEXT, created INTEGER NOT NULL, last_seen INTEGER NOT NULL, revoked INTEGER );
    CREATE TABLE IF NOT EXISTS passkeys ( id TEXT PRIMARY KEY, user_id TEXT NOT NULL, public_key TEXT NOT NULL, counter INTEGER NOT NULL, transports TEXT, label TEXT, created INTEGER NOT NULL, last_used INTEGER );
    CREATE TABLE IF NOT EXISTS email_links ( token_hash TEXT PRIMARY KEY, code_hash TEXT NOT NULL, email TEXT NOT NULL, attach_to TEXT, source TEXT, created INTEGER NOT NULL, expires INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0 );
    CREATE TABLE IF NOT EXISTS challenges ( challenge TEXT PRIMARY KEY, kind TEXT NOT NULL, user_id TEXT, expires INTEGER NOT NULL );
    CREATE TABLE IF NOT EXISTS failures ( at INTEGER NOT NULL, source TEXT );
    CREATE TABLE IF NOT EXISTS email_sends ( email TEXT NOT NULL, source TEXT, at INTEGER NOT NULL );
    CREATE TABLE IF NOT EXISTS outbox ( email TEXT NOT NULL, link TEXT NOT NULL, code TEXT NOT NULL, at INTEGER NOT NULL );
`

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// base64url ⇄ bytes (passkey public keys are stored as text)
const to_b64url = bytes => btoa( String.fromCharCode( ...bytes ) ).replace( /\+/g, `-` ).replace( /\//g, `_` ).replace( /=+$/, `` )
const from_b64url = text => Uint8Array.from( atob( text.replace( /-/g, `+` ).replace( /_/g, `/` ) ), char => char.charCodeAt( 0 ) )

// The challenge a WebAuthn response answers (verification then checks it properly), or null
const challenge_of = response => {
    try {
        const { challenge } = JSON.parse( new TextDecoder().decode( from_b64url( response.response.clientDataJSON ) ) )
        return typeof challenge === `string` ? challenge : null
    } catch {
        return null
    }
}

/**
 * Normalizes an email for lookup.
 * @param {string} email
 * @returns {string|null} null when it isn't an email
 */
export const normalize_email = email => {
    const clean = String( email ?? `` ).trim().toLowerCase()
    return EMAIL.test( clean ) && clean.length <= 254 ? clean : null
}

/**
 * Every account of the deployment: users, sessions, passkeys, email links (plan §4.1).
 * Only the Worker calls it (RPC). Stores hashes of every secret; plaintext leaves exactly once.
 */
export class Auth extends DurableObject {

    constructor( ctx, env ) {
        super( ctx, env )
        this.sql = ctx.storage.sql

        // The single-owner code scheme (enrollment, pairing, recovery) is gone. No account ever used it in
        // production, so its tables are dropped rather than migrated
        if( this.rows( `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'owner'` ).length ) {
            for( const table of [ `owner`, `pairing`, `recovery`, `sessions` ] ) this.sql.exec( `DROP TABLE IF EXISTS ${ table }` )
        }
        this.sql.exec( SCHEMA )
    }

    // ── helpers ──────────────────────────────────────────────────────────────

    rows( query, ...bindings ) {
        return [ ...this.sql.exec( query, ...bindings ) ]
    }

    // Relying party: always our public origin (wrangler dev rewrites request URLs, so never derive it)
    rp() {
        const origin = this.env.ORIGIN
        return { origin, id: new URL( origin ).hostname }
    }

    // Too many failures recently from this source: refuse before looking at the secret
    throttled( now, source ) {
        this.sql.exec( `DELETE FROM failures WHERE at < ?`, now - FAILURE_WINDOW )
        const [ { mine, total } ] = this.rows( `SELECT count( CASE WHEN source = ? THEN 1 END ) AS mine, count(*) AS total FROM failures`, source )
        return mine >= MAX_FAILURES || total >= MAX_FAILURES_ALL
    }

    fail( now, source, error = `invalid` ) {
        this.sql.exec( `INSERT INTO failures ( at, source ) VALUES ( ?, ? )`, now, source )
        return { error }
    }

    async open_session( user_id, label, now ) {
        const token = random_token()
        const id = crypto.randomUUID()
        this.sql.exec( `INSERT INTO sessions ( id, user_id, token_hash, label, created, last_seen ) VALUES ( ?, ?, ?, ?, ?, ? )`,
            id, user_id, await sha256( token ), String( label || `Unknown device` ).slice( 0, 60 ), now, now )
        return { token, session_id: id, user_id }
    }

    create_user( now, email = null, id = crypto.randomUUID() ) {
        this.sql.exec( `INSERT INTO users ( id, email, created ) VALUES ( ?, ?, ? )`, id, email, now )
        return id
    }

    // A challenge is single use: taking it deletes it
    take_challenge( challenge, kind, now ) {
        return this.sql.exec( `DELETE FROM challenges WHERE challenge = ? AND kind = ? AND expires > ? RETURNING user_id`, challenge, kind, now ).toArray()[ 0 ] ?? null
    }

    store_challenge( challenge, kind, user_id, now ) {
        this.sql.exec( `DELETE FROM challenges WHERE expires <= ?`, now )
        this.sql.exec( `INSERT INTO challenges ( challenge, kind, user_id, expires ) VALUES ( ?, ?, ?, ? )`, challenge, kind, user_id, now + CHALLENGE_TTL )
    }

    // ── Sessions ─────────────────────────────────────────────────────────────

    /**
     * Resolves a session cookie token.
     * @param {string} token
     * @returns {Promise<{ session_id: string, owner_id: string, email: string|null }|null>} owner_id = the user (owns one Sync DO)
     */
    async check( token ) {
        if( !token ) return null
        const [ session ] = this.rows( `
            SELECT sessions.id, sessions.last_seen, users.id AS user_id, users.email FROM sessions
            JOIN users ON users.id = sessions.user_id
            WHERE token_hash = ? AND revoked IS NULL`, await sha256( token ) )
        if( !session ) return null
        const now = Date.now()
        if( now - session.last_seen > LAST_SEEN_EVERY ) this.sql.exec( `UPDATE sessions SET last_seen = ? WHERE id = ?`, now, session.id )
        return { session_id: session.id, owner_id: session.user_id, email: session.email }
    }

    /**
     * A user's live sessions, newest first.
     * @param {string} user_id
     * @returns {Array<{ id: string, label: string, created: number, last_seen: number }>}
     */
    sessions( user_id ) {
        return this.rows( `SELECT id, label, created, last_seen FROM sessions WHERE user_id = ? AND revoked IS NULL ORDER BY created DESC`, user_id )
    }

    /**
     * Revokes one of a user's sessions. The Worker then tells the Sync DO to drop its sockets.
     * @param {string} user_id
     * @param {string} id
     * @returns {boolean} whether a live session was revoked
     */
    revoke( user_id, id ) {
        return this.sql.exec( `UPDATE sessions SET revoked = ? WHERE id = ? AND user_id = ? AND revoked IS NULL RETURNING id`, Date.now(), id, user_id ).toArray().length > 0
    }

    /**
     * Every user, for the nightly backup.
     * @returns {string[]}
     */
    user_ids() {
        return this.rows( `SELECT id FROM users` ).map( ( { id } ) => id )
    }

    // ── Email links ──────────────────────────────────────────────────────────

    /**
     * New sign-in link + code for an email. Signs in (or creates) that email's account; while signed in
     * (`attach_to`) it instead adds the email to the current account. The Worker sends it.
     * @param {string} email - raw input
     * @param {string} source - caller address, for throttling
     * @param {string|null} attach_to - signed-in user adding this email
     * @returns {Promise<{ email: string, link: string, code: string }|{ error: string }>}
     */
    async email_link( email, source = `unknown`, attach_to = null ) {

        const now = Date.now()
        const address = normalize_email( email )
        if( !address ) return { error: `bad_email` }

        // Secrets + hashes first: no await may sit between the quota check and the writes it guards
        const token = random_token()
        const code = random_code( 40 )
        const token_hash = await sha256( token )
        const code_hash = await sha256( normalize_code( code ) )

        // Bound how often anyone can make us send mail, per inbox and per sender. Counted per send, not per
        // open link: using or killing a link must not hand the allowance back
        this.sql.exec( `DELETE FROM email_sends WHERE at < ?`, now - HOUR )
        this.sql.exec( `DELETE FROM email_links WHERE expires <= ?`, now )
        const [ { to_email, from_source } ] = this.rows( `SELECT count( CASE WHEN email = ? THEN 1 END ) AS to_email, count( CASE WHEN source = ? THEN 1 END ) AS from_source FROM email_sends`, address, source )
        if( to_email >= LINKS_PER_EMAIL || from_source >= LINKS_PER_SOURCE ) return { error: `throttled` }

        this.sql.exec( `INSERT INTO email_sends ( email, source, at ) VALUES ( ?, ?, ? )`, address, source, now )
        this.sql.exec( `INSERT INTO email_links ( token_hash, code_hash, email, attach_to, source, created, expires ) VALUES ( ?, ?, ?, ?, ?, ?, ? )`,
            token_hash, code_hash, address, attach_to, source, now, now + LINK_TTL )

        const link = `${ this.env.ORIGIN }/signin?token=${ token }`
        if( this.env.E2E ) this.sql.exec( `INSERT INTO outbox ( email, link, code, at ) VALUES ( ?, ?, ?, ? )`, address, link, code, now )
        return { email: address, link, code }
    }

    /**
     * Uses an email link: by its token (the link), or by email + code (typed, e.g. in the installed app,
     * which the link can't open). Single use. Unknown email = new account.
     * @param {{ token?: string, email?: string, code?: string }} proof
     * @param {string} label - human device name
     * @param {string} source - caller address
     * @param {string|null} current_user - the signed-in user using it, if any
     * @returns {Promise<{ token: string, session_id: string, user_id: string, created: boolean }|{ added: true }|{ error: string }>}
     */
    async email_login( { token, email, code }, label, source = `unknown`, current_user = null ) {

        const now = Date.now()
        if( this.throttled( now, source ) ) return { error: `throttled` }

        // Hash first: no await may sit between the lookup and the writes it guards
        const token_hash = token ? await sha256( token ) : null
        const code_hash = code ? await sha256( normalize_code( code ) ) : null
        const address = normalize_email( email )

        // Find, check, then use up: all synchronous, so atomic inside the DO
        const [ link ] = token_hash
            ? this.rows( `SELECT token_hash, email, attach_to FROM email_links WHERE token_hash = ? AND expires > ?`, token_hash, now )
            : address && code_hash
                ? this.rows( `SELECT token_hash, email, attach_to FROM email_links WHERE email = ? AND code_hash = ? AND expires > ?`, address, code_hash, now )
                : []

        // A wrong code burns an attempt on that inbox's open codes. Spent codes die, their links still work
        // (so a stranger guessing can't kill the link in your inbox)
        if( !link && !token_hash && address ) {
            this.sql.exec( `UPDATE email_links SET attempts = attempts + 1 WHERE email = ?`, address )
            this.sql.exec( `UPDATE email_links SET code_hash = '' WHERE attempts >= ?`, CODE_ATTEMPTS )
        }
        if( !link ) return this.fail( now, source )

        // Adding an email to a signed-in account: only from inside that account (so nobody can sign a stranger
        // into theirs), and only if no other account has it. Refused = not used up: the code still works there
        if( link.attach_to ) {
            if( current_user !== link.attach_to ) return { error: `wrong_account` }
            const [ owner ] = this.rows( `SELECT id FROM users WHERE email = ?`, link.email )
            if( owner && owner.id !== link.attach_to ) return { error: `email_taken` }
            this.sql.exec( `DELETE FROM email_links WHERE token_hash = ?`, link.token_hash )
            this.sql.exec( `UPDATE users SET email = ? WHERE id = ?`, link.email, link.attach_to )
            return { added: true }
        }

        this.sql.exec( `DELETE FROM email_links WHERE token_hash = ?`, link.token_hash )
        const [ user ] = this.rows( `SELECT id FROM users WHERE email = ?`, link.email )
        const user_id = user?.id ?? this.create_user( now, link.email )
        return { ...await this.open_session( user_id, label, now ), created: !user }
    }

    /**
     * Last mail "sent" to an address. Only with the E2E var (wrangler dev), where nothing is really sent.
     * @param {string} email
     */
    outbox( email ) {
        if( !this.env.E2E ) return null
        return this.rows( `SELECT link, code FROM outbox WHERE email = ? ORDER BY at DESC LIMIT 1`, normalize_email( email ) )[ 0 ] ?? null
    }

    // ── Passkeys ─────────────────────────────────────────────────────────────

    /**
     * Options to create a passkey: for the signed-in user, or (user_id null) a brand new account.
     * @param {string|null} user_id
     * @returns {Promise<Object>} PublicKeyCredentialCreationOptionsJSON
     */
    async passkey_registration( user_id ) {
        const now = Date.now()
        const user = user_id ? this.rows( `SELECT id, email FROM users WHERE id = ?`, user_id )[ 0 ] : null
        const id = user?.id ?? crypto.randomUUID()
        const existing = user ? this.rows( `SELECT id, transports FROM passkeys WHERE user_id = ?`, id ) : []

        const options = await generateRegistrationOptions( {
            rpName: `Dolist`,
            rpID: this.rp().id,
            userID: new TextEncoder().encode( id ),
            userName: user?.email ?? `Dolist`,
            userDisplayName: user?.email ?? `Dolist`,
            attestationType: `none`,
            excludeCredentials: existing.map( key => ( { id: key.id, transports: key.transports ? JSON.parse( key.transports ) : undefined } ) ),
            authenticatorSelection: { residentKey: `required`, userVerification: `preferred` },
        } )

        // A new account's id rides on the challenge; it only exists once the passkey verifies
        this.store_challenge( options.challenge, user ? `register` : `register_new`, id, now )
        return options
    }

    /**
     * Verifies a new passkey. For a new account this also creates the user + session.
     * @param {Object} response - RegistrationResponseJSON
     * @param {string|null} user_id - the signed-in user, if any
     * @param {string} label - device name for the session
     * @param {string} source
     * @returns {Promise<Object>} { token, session_id, user_id, created } for a new account, { ok } otherwise, or { error }
     */
    async passkey_register( response, user_id, label, source = `unknown` ) {

        const now = Date.now()
        if( this.throttled( now, source ) ) return { error: `throttled` }

        const challenge = challenge_of( response )
        if( !challenge ) return this.fail( now, source )
        const pending = this.take_challenge( challenge, user_id ? `register` : `register_new`, now )
        if( !pending || user_id && pending.user_id !== user_id ) return this.fail( now, source )

        let verification
        try {
            verification = await verifyRegistrationResponse( {
                response,
                expectedChallenge: challenge,
                expectedOrigin: this.rp().origin,
                expectedRPID: this.rp().id,
                requireUserVerification: false,
            } )
        } catch {
            return this.fail( now, source )
        }
        if( !verification.verified ) return this.fail( now, source )

        const { credential } = verification.registrationInfo
        const owner = pending.user_id
        if( !user_id ) this.create_user( now, null, owner )
        this.sql.exec( `INSERT INTO passkeys ( id, user_id, public_key, counter, transports, label, created ) VALUES ( ?, ?, ?, ?, ?, ?, ? )`,
            credential.id, owner, to_b64url( credential.publicKey ), credential.counter, JSON.stringify( credential.transports ?? [] ), String( label || `Passkey` ).slice( 0, 60 ), now )

        if( user_id ) return { ok: true }
        return { ...await this.open_session( owner, label, now ), created: true }
    }

    /**
     * Options to sign in with any passkey for this site (discoverable, no email typed).
     * @returns {Promise<Object>} PublicKeyCredentialRequestOptionsJSON
     */
    async passkey_options() {
        const options = await generateAuthenticationOptions( { rpID: this.rp().id, userVerification: `preferred` } )
        this.store_challenge( options.challenge, `login`, null, Date.now() )
        return options
    }

    /**
     * Signs in with a passkey.
     * @param {Object} response - AuthenticationResponseJSON
     * @param {string} label
     * @param {string} source
     * @returns {Promise<{ token: string, session_id: string, user_id: string }|{ error: string }>}
     */
    async passkey_login( response, label, source = `unknown` ) {

        const now = Date.now()
        if( this.throttled( now, source ) ) return { error: `throttled` }

        const challenge = challenge_of( response )
        if( !challenge ) return this.fail( now, source )
        if( !this.take_challenge( challenge, `login`, now ) ) return this.fail( now, source )

        // A passkey whose account was deleted, or that was removed in Settings
        const [ key ] = this.rows( `SELECT * FROM passkeys WHERE id = ?`, String( response.id ) )
        if( !key ) return this.fail( now, source, `unknown_passkey` )

        let verification
        try {
            verification = await verifyAuthenticationResponse( {
                response,
                expectedChallenge: challenge,
                expectedOrigin: this.rp().origin,
                expectedRPID: this.rp().id,
                credential: { id: key.id, publicKey: from_b64url( key.public_key ), counter: key.counter, transports: key.transports ? JSON.parse( key.transports ) : undefined },
                requireUserVerification: false,
            } )
        } catch {
            return this.fail( now, source )
        }
        if( !verification.verified ) return this.fail( now, source )

        this.sql.exec( `UPDATE passkeys SET counter = ?, last_used = ? WHERE id = ?`, verification.authenticationInfo.newCounter, now, key.id )
        return this.open_session( key.user_id, label, now )
    }

    /**
     * A user's passkeys, newest first.
     * @param {string} user_id
     */
    passkeys( user_id ) {
        return this.rows( `SELECT id, label, created, last_used FROM passkeys WHERE user_id = ? ORDER BY created DESC`, user_id )
    }

    /**
     * Removes a passkey, unless it's the account's only way back in (no email, no other passkey).
     * @param {string} user_id
     * @param {string} id
     * @returns {{ ok: true }|{ error: string }}
     */
    remove_passkey( user_id, id ) {
        const [ { email } ] = this.rows( `SELECT email FROM users WHERE id = ?`, user_id )
        const keys = this.passkeys( user_id )
        if( !keys.some( key => key.id === id ) ) return { error: `not_found` }
        if( !email && keys.length === 1 ) return { error: `last_sign_in` }
        this.sql.exec( `DELETE FROM passkeys WHERE id = ? AND user_id = ?`, id, user_id )
        return { ok: true }
    }

}
