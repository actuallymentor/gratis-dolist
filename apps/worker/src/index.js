import { Hono } from 'hono'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import { Auth } from './auth.js'
import { SESSION_HEADER, Sync } from './sync.js'

export { Auth, Sync }

const SNAPSHOT_PREFIX = `snapshots/`
const KEEP_SNAPSHOTS = 30
const COOKIE_DAYS = 400

// https gets the hardened __Host- cookie; http is only ever wrangler dev on localhost
const cookie_name = url => url.startsWith( `https:` ) ? `__Host-dolist_session` : `dolist_session`
const cookie_options = url => ( { path: `/`, httpOnly: true, sameSite: `Strict`, secure: url.startsWith( `https:` ), maxAge: COOKIE_DAYS * 86_400 } )

/**
 * The deployment's Auth DO. Only for local e2e (`wrangler dev --var E2E:1`), a `dolist_tenant` cookie picks
 * an isolated owner so parallel browser tests don't share one. No config may set E2E (apps/worker/test guards it);
 * the host can't gate this, since wrangler dev rewrites URLs to the route host.
 * @param {Object} c - Hono context
 */
const auth_of = c => {
    const tenant = c.env.E2E && getCookie( c, `dolist_tenant` ) || `default`
    return c.env.AUTH.get( c.env.AUTH.idFromName( `auth:${ tenant }` ) )
}
const sync_of = ( env, owner_id ) => env.SYNC.get( env.SYNC.idFromName( owner_id ) )

/**
 * Takes one owner's snapshot into R2 and prunes old ones.
 * @returns {Promise<string>} the new key
 */
const take_snapshot = async ( env, owner_id ) => {
    const json = await sync_of( env, owner_id ).snapshot()
    const key = `${ SNAPSHOT_PREFIX }${ owner_id }/${ new Date().toISOString() }.json`
    await env.SNAPSHOTS.put( key, json, { httpMetadata: { contentType: `application/json` } } )

    const { objects } = await env.SNAPSHOTS.list( { prefix: `${ SNAPSHOT_PREFIX }${ owner_id }/` } )
    const stale = objects.map( ( { key } ) => key ).sort().slice( 0, -KEEP_SNAPSHOTS )
    if( stale.length ) await env.SNAPSHOTS.delete( stale )
    return key
}

const app = new Hono()

// CSRF: anything that changes state, and every WebSocket upgrade, must come from our own origin
app.use( `*`, async ( c, next ) => {
    const changes_state = c.req.method !== `GET` || c.req.header( `upgrade` )?.toLowerCase() === `websocket`
    if( changes_state && c.req.header( `origin` ) !== new URL( c.req.url ).origin ) return c.text( `Bad origin`, 403 )
    c.header( `Cache-Control`, `no-store` )
    await next()
} )

// Resolves the session cookie; routes below that need an owner use `signed_in`
app.use( `*`, async ( c, next ) => {
    const token = getCookie( c, cookie_name( c.req.url ) )
    c.set( `session`, token ? await auth_of( c ).check( token ) : null )
    await next()
} )
const signed_in = async ( c, next ) => c.get( `session` ) ? next() : c.json( { error: `signed_out` }, 401 )

/**
 * Session state + server time (the client derives its clock offset from `now`).
 */
app.get( `/api/session`, async c => {
    const session = c.get( `session` )
    return c.json( {
        now: Date.now(),
        signed_in: !!session,
        session_id: session?.session_id ?? null,
        enrollable: !session && await auth_of( c ).enrollable(),
    } )
} )

app.post( `/api/login`, async c => {
    const { code, label } = await c.req.json().catch( () => ( {} ) )
    const result = await auth_of( c ).login( code, label, c.req.header( `cf-connecting-ip` ) )
    if( result.error === `throttled` ) return c.json( { error: `Too many attempts, try again in a few minutes` }, 429 )
    if( result.error ) return c.json( { error: `That code didn't work` }, 401 )
    setCookie( c, cookie_name( c.req.url ), result.token, cookie_options( c.req.url ) )
    return c.json( { session_id: result.session_id, recovery_codes: result.recovery_codes ?? null } )
} )

app.post( `/api/logout`, signed_in, async c => {
    const { session_id, owner_id } = c.get( `session` )
    await auth_of( c ).revoke( session_id )
    await sync_of( c.env, owner_id ).revoke( session_id )
    deleteCookie( c, cookie_name( c.req.url ), cookie_options( c.req.url ) )
    return c.json( { ok: true } )
} )

app.post( `/api/pair`, signed_in, async c => c.json( await auth_of( c ).pair() ) )

app.get( `/api/devices`, signed_in, async c => c.json( await auth_of( c ).sessions() ) )

// Revoke: the session dies first, then its live sockets close (within one RPC round trip)
app.delete( `/api/devices/:id`, signed_in, async c => {
    const id = c.req.param( `id` )
    const revoked = await auth_of( c ).revoke( id )
    if( !revoked ) return c.json( { error: `No such device` }, 404 )
    await sync_of( c.env, c.get( `session` ).owner_id ).revoke( id )
    return c.json( { ok: true } )
} )

app.get( `/api/snapshots`, signed_in, async c => {
    const { owner_id } = c.get( `session` )
    const { objects } = await c.env.SNAPSHOTS.list( { prefix: `${ SNAPSHOT_PREFIX }${ owner_id }/` } )
    return c.json( objects.map( ( { key, size, uploaded } ) => ( { name: key.split( `/` ).pop(), size, uploaded } ) ).reverse() )
} )

app.post( `/api/snapshots`, signed_in, async c => {
    const key = await take_snapshot( c.env, c.get( `session` ).owner_id )
    return c.json( { name: key.split( `/` ).pop() } )
} )

app.get( `/api/snapshots/:name`, signed_in, async c => {
    const name = c.req.param( `name` )
    if( !/^[\w.:-]+\.json$/.test( name ) ) return c.json( { error: `Bad name` }, 400 )
    const object = await c.env.SNAPSHOTS.get( `${ SNAPSHOT_PREFIX }${ c.get( `session` ).owner_id }/${ name }` )
    if( !object ) return c.json( { error: `Not found` }, 404 )
    return new Response( object.body, { headers: {
        'Content-Type': `application/json`,
        'Content-Disposition': `attachment; filename="dolist-backup-${ name }"`,
        'Cache-Control': `no-store`,
    } } )
} )

// Sync socket: the DO is chosen by the authenticated owner, never by anything the client sends
app.get( `/sync`, signed_in, async c => {
    if( c.req.header( `upgrade` )?.toLowerCase() !== `websocket` ) return c.text( `Upgrade required`, 426 )
    const { session_id, owner_id } = c.get( `session` )
    const headers = new Headers( c.req.raw.headers )
    headers.set( SESSION_HEADER, session_id )
    return sync_of( c.env, owner_id ).fetch( new Request( `https://sync/${ owner_id }`, { headers } ) )
} )

app.all( `/api/*`, c => c.json( { error: `Not found` }, 404 ) )

export default {
    fetch: app.fetch,

    // Nightly backup of every owner (one per deployment, plus e2e tenants never exist in prod)
    async scheduled( event, env ) {
        const auth = env.AUTH.get( env.AUTH.idFromName( `auth:default` ) )
        const owner_id = await auth.owner()
        if( owner_id ) await take_snapshot( env, owner_id )
    },
}
