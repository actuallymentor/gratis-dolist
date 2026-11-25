import { DurableObject } from 'cloudflare:workers'
import { normalize_code, random_code, random_token, sha256 } from './codes.js'

const MINUTE = 60_000
const PAIRING_TTL = 5 * MINUTE
const FAILURE_WINDOW = 10 * MINUTE
const MAX_FAILURES = 10        // per source address
const MAX_FAILURES_ALL = 1_000  // all sources: bounds the table, too high to lock the owner out
const RECOVERY_CODES = 10
const LAST_SEEN_EVERY = 5 * MINUTE

const SCHEMA = `
    CREATE TABLE IF NOT EXISTS owner ( id TEXT PRIMARY KEY, created INTEGER NOT NULL, confirmed INTEGER );
    CREATE TABLE IF NOT EXISTS sessions ( id TEXT PRIMARY KEY, token_hash TEXT UNIQUE NOT NULL, label TEXT, created INTEGER NOT NULL, last_seen INTEGER NOT NULL, revoked INTEGER );
    CREATE TABLE IF NOT EXISTS pairing ( code_hash TEXT PRIMARY KEY, expires INTEGER NOT NULL );
    CREATE TABLE IF NOT EXISTS recovery ( code_hash TEXT PRIMARY KEY );
    CREATE TABLE IF NOT EXISTS failures ( at INTEGER NOT NULL, source TEXT );
`

/**
 * The deployment's single owner: credentials, sessions, pairing + recovery codes (plan §4.1).
 * Only the Worker calls it (RPC). Stores hashes only; plaintext codes leave exactly once.
 */
export class Auth extends DurableObject {

    constructor( ctx, env ) {
        super( ctx, env )
        this.sql = ctx.storage.sql
        this.sql.exec( SCHEMA )
    }

    // ── helpers ──────────────────────────────────────────────────────────────

    rows( query, ...bindings ) {
        return [ ...this.sql.exec( query, ...bindings ) ]
    }

    owner() {
        return this.rows( `SELECT id FROM owner` )[ 0 ]?.id ?? null
    }

    // An owner counts once its first session has been used: until then the enrollment response may have
    // been lost in transit (no cookie, no recovery codes), so enrollment stays open and starts over
    confirmed() {
        return !!this.rows( `SELECT confirmed FROM owner` )[ 0 ]?.confirmed
    }

    // Too many wrong codes recently from this source: refuse before looking at the code.
    // Per source, so a stranger can't lock the owner out; the codes themselves are unguessable
    throttled( now, source ) {
        this.sql.exec( `DELETE FROM failures WHERE at < ?`, now - FAILURE_WINDOW )
        const [ { mine, total } ] = this.rows( `SELECT count( CASE WHEN source = ? THEN 1 END ) AS mine, count(*) AS total FROM failures`, source )
        return mine >= MAX_FAILURES || total >= MAX_FAILURES_ALL
    }

    async open_session( label, now ) {
        const token = random_token()
        const id = crypto.randomUUID()
        this.sql.exec( `INSERT INTO sessions ( id, token_hash, label, created, last_seen ) VALUES ( ?, ?, ?, ?, ? )`,
            id, await sha256( token ), String( label || `Unknown device` ).slice( 0, 60 ), now, now )
        return { token, session_id: id, owner_id: this.owner() }
    }

    // ── RPC ──────────────────────────────────────────────────────────────────

    /**
     * Whether a first owner can still enroll.
     * @returns {boolean}
     */
    enrollable() {
        return !this.confirmed() && !!this.env.ENROLLMENT_CODE
    }

    /**
     * Exchanges a typed code for a session. Tries enrollment (only while no owner), then pairing, then recovery.
     * @param {string} code
     * @param {string} label - human device name
     * @param {string} source - caller address (CF-Connecting-IP), for throttling
     * @returns {Promise<{ token?: string, session_id?: string, owner_id?: string, recovery_codes?: string[], error?: string }>}
     */
    async login( code, label, source = `unknown` ) {

        const now = Date.now()
        if( this.throttled( now, source ) ) return { error: `throttled` }

        const typed = normalize_code( code )
        const hash = await sha256( typed )

        // Enrollment: closes for good once the owner's first session is used (see confirmed). A retry before
        // that discards the unconfirmed attempt, which never synced anything
        if( this.enrollable() && hash === await sha256( normalize_code( this.env.ENROLLMENT_CODE ) ) ) {
            for( const table of [ `owner`, `sessions`, `recovery`, `pairing` ] ) this.sql.exec( `DELETE FROM ${ table }` )
            this.sql.exec( `INSERT INTO owner ( id, created ) VALUES ( ?, ? )`, crypto.randomUUID(), now )
            const recovery_codes = Array.from( { length: RECOVERY_CODES }, () => random_code( 80 ) )
            for( const recovery of recovery_codes ) this.sql.exec( `INSERT INTO recovery ( code_hash ) VALUES ( ? )`, await sha256( normalize_code( recovery ) ) )
            return { ...await this.open_session( label, now ), recovery_codes }
        }

        // Pairing + recovery codes are single-use: delete-then-check is atomic inside the DO
        if( this.confirmed() ) {
            const paired = this.sql.exec( `DELETE FROM pairing WHERE code_hash = ? AND expires > ? RETURNING code_hash`, hash, now ).toArray().length
            const recovered = !paired && this.sql.exec( `DELETE FROM recovery WHERE code_hash = ? RETURNING code_hash`, hash ).toArray().length
            if( paired || recovered ) return this.open_session( label, now )
        }

        this.sql.exec( `INSERT INTO failures ( at, source ) VALUES ( ?, ? )`, now, source )
        return { error: `invalid` }
    }

    /**
     * Resolves a session cookie token.
     * @param {string} token
     * @returns {Promise<{ session_id: string, owner_id: string }|null>}
     */
    async check( token ) {
        if( !token ) return null
        const [ session ] = this.rows( `SELECT id, last_seen FROM sessions WHERE token_hash = ? AND revoked IS NULL`, await sha256( token ) )
        if( !session ) return null
        const now = Date.now()
        this.sql.exec( `UPDATE owner SET confirmed = ? WHERE confirmed IS NULL`, now )
        if( now - session.last_seen > LAST_SEEN_EVERY ) this.sql.exec( `UPDATE sessions SET last_seen = ? WHERE id = ?`, now, session.id )
        return { session_id: session.id, owner_id: this.owner() }
    }

    /**
     * New pairing code for another device. Caller must hold a live session.
     * @returns {Promise<{ code: string, expires: number }>}
     */
    async pair() {
        const now = Date.now()
        this.sql.exec( `DELETE FROM pairing WHERE expires <= ?`, now )
        const code = random_code( 128 )
        const expires = now + PAIRING_TTL
        this.sql.exec( `INSERT INTO pairing ( code_hash, expires ) VALUES ( ?, ? )`, await sha256( normalize_code( code ) ), expires )
        return { code, expires }
    }

    /**
     * Live sessions, newest first.
     * @returns {Array<{ id: string, label: string, created: number, last_seen: number }>}
     */
    sessions() {
        return this.rows( `SELECT id, label, created, last_seen FROM sessions WHERE revoked IS NULL ORDER BY created DESC` )
    }

    /**
     * Revokes a session. The Worker then tells the Sync DO to drop its sockets.
     * @param {string} id
     * @returns {boolean} whether a live session was revoked
     */
    revoke( id ) {
        return this.sql.exec( `UPDATE sessions SET revoked = ? WHERE id = ? AND revoked IS NULL RETURNING id`, Date.now(), id ).toArray().length > 0
    }

}
