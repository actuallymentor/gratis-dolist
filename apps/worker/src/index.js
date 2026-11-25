import { Hono } from 'hono'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import { Auth } from './auth.js'
import { SESSION_HEADER, Sync } from './sync.js'

export { Auth, Sync }

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
app.get( `/api/session`, c => {
    const session = c.get( `session` )
    return c.json( {
        now: Date.now(),
        signed_in: !!session,
        session_id: session?.session_id ?? null,
        user_id: session?.owner_id ?? null,
        email: session?.email ?? null,
    } )
} )

const source_of = c => c.req.header( `cf-connecting-ip` ) ?? `unknown`
const body_of = c => c.req.json().catch( () => ( {} ) )

// Sets the session cookie for a successful sign-in
const signed_in_as = ( c, { token, session_id, created } ) => {
    setCookie( c, cookie_name( c.req.url ), token, cookie_options( c.req.url ) )
    return c.json( { session_id, created: !!created } )
}

const ERRORS = {
    throttled: [ `Too many attempts, try again in a few minutes`, 429 ],
    bad_email: [ `That doesn't look like an email address`, 400 ],
    invalid: [ `That link or code didn't work. It may have expired or been used already.`, 401 ],
    unknown_passkey: [ `This passkey isn't linked to an account any more. Sign in with email instead.`, 401 ],
    email_taken: [ `Another account already uses that email`, 409 ],
    wrong_account: [ `Open that link on a device signed in to the account that asked for it, or type the code there`, 403 ],
    last_sign_in: [ `This is your only way to sign in. Add an email or another passkey first.`, 409 ],
    not_found: [ `Not found`, 404 ],
}
const failed = ( c, error ) => {
    const [ message, status ] = ERRORS[ error ] ?? ERRORS.invalid
    return c.json( { error: message }, status )
}

/**
 * Mails a sign-in link + code. Under E2E nothing is sent (the Auth DO keeps an outbox instead).
 */
const send_link = async ( env, { email, link, code }, adding ) => {
    if( env.E2E ) return
    const intro = adding ? `Confirm this email for your Dolist account.` : `Sign in to Dolist (this also creates your account if you're new).`
    await env.EMAIL.send( {
        to: email,
        from: { email: env.EMAIL_FROM, name: `Dolist` },
        subject: adding ? `Confirm your email for Dolist` : `Sign in to Dolist`,
        text: `${ intro }\n\nOpen this link:\n${ link }\n\nOr type this code in the app: ${ code }\n\nIt works once, for 15 minutes. Didn't ask for this? Ignore this email.`,
        html: `<p>${ intro }</p><p><a href="${ link }">Sign in to Dolist</a></p><p>Or type this code in the app: <strong style="font-family:monospace;font-size:1.2em">${ code }</strong></p><p style="color:#666">It works once, for 15 minutes. Didn't ask for this? Ignore this email.</p>`,
    } )
}

// Email link: signs in or creates the account. While signed in, it adds the email to this account instead
app.post( `/api/email-link`, async c => {
    const { email } = await body_of( c )
    const session = c.get( `session` )
    const result = await auth_of( c ).email_link( email, source_of( c ), session?.owner_id ?? null )
    if( result.error ) return failed( c, result.error )
    try {
        await send_link( c.env, result, !!session )
    } catch ( error ) {
        console.error( `email:`, error?.code, error?.message )
        return c.json( { error: `Couldn't send the email right now. Try a passkey, or try again later.` }, 503 )
    }
    return c.json( { sent_to: result.email } )
} )

app.post( `/api/login/email`, async c => {
    const { token, email, code, label } = await body_of( c )
    const session = c.get( `session` )
    const result = await auth_of( c ).email_login( { token, email, code }, label, source_of( c ), session?.owner_id ?? null )
    if( result.error ) return failed( c, result.error )
    if( result.added ) return c.json( { added: true } )
    return signed_in_as( c, result )
} )

// Passkeys: create one (signed in: add to this account; signed out: a new account), sign in with one
app.post( `/api/passkey/register/options`, async c => c.json( await auth_of( c ).passkey_registration( c.get( `session` )?.owner_id ?? null ) ) )

app.post( `/api/passkey/register`, async c => {
    const { response, label } = await body_of( c )
    const session = c.get( `session` )
    const result = await auth_of( c ).passkey_register( response, session?.owner_id ?? null, label, source_of( c ) )
    if( result.error ) return failed( c, result.error )
    return result.token ? signed_in_as( c, result ) : c.json( { ok: true } )
} )

app.post( `/api/passkey/login/options`, async c => c.json( await auth_of( c ).passkey_options() ) )

app.post( `/api/passkey/login`, async c => {
    const { response, label } = await body_of( c )
    const result = await auth_of( c ).passkey_login( response, label, source_of( c ) )
    if( result.error ) return failed( c, result.error )
    return signed_in_as( c, result )
} )

app.get( `/api/passkeys`, signed_in, async c => c.json( await auth_of( c ).passkeys( c.get( `session` ).owner_id ) ) )

app.delete( `/api/passkeys/:id`, signed_in, async c => {
    const result = await auth_of( c ).remove_passkey( c.get( `session` ).owner_id, c.req.param( `id` ) )
    return result.error ? failed( c, result.error ) : c.json( result )
} )

app.post( `/api/logout`, signed_in, async c => {
    const { session_id, owner_id } = c.get( `session` )
    await sync_of( c.env, owner_id ).revoke( session_id )
    await auth_of( c ).revoke( owner_id, session_id )
    deleteCookie( c, cookie_name( c.req.url ), cookie_options( c.req.url ) )
    return c.json( { ok: true } )
} )

app.get( `/api/devices`, signed_in, async c => c.json( await auth_of( c ).sessions( c.get( `session` ).owner_id ) ) )

// Revoke: fence + close sockets in Sync first, then kill the session. If either step fails, retrying
// redoes both (each is idempotent), so a half-done revoke never leaves a live socket behind
app.delete( `/api/devices/:id`, signed_in, async c => {
    const id = c.req.param( `id` )
    const { owner_id } = c.get( `session` )
    const known = ( await auth_of( c ).sessions( owner_id ) ).some( session => session.id === id )
    if( !known ) return c.json( { error: `No such device` }, 404 )
    await sync_of( c.env, owner_id ).revoke( id )
    await auth_of( c ).revoke( owner_id, id )
    return c.json( { ok: true } )
} )

// Local e2e only: the mail a test "received"
app.get( `/api/e2e/outbox`, async c => {
    if( !c.env.E2E ) return c.json( { error: `Not found` }, 404 )
    return c.json( await auth_of( c ).outbox( c.req.query( `email` ) ) )
} )

app.get( `/api/snapshots`, signed_in, async c => {
    return c.json( await sync_of( c.env, c.get( `session` ).owner_id ).snapshots() )
} )

app.post( `/api/snapshots`, signed_in, async c => {
    return c.json( { name: await sync_of( c.env, c.get( `session` ).owner_id ).take_snapshot() } )
} )

app.get( `/api/snapshots/:name`, signed_in, async c => {
    const name = c.req.param( `name` )
    if( !/^[\w.:-]+\.json$/.test( name ) ) return c.json( { error: `Bad name` }, 400 )
    const json = await sync_of( c.env, c.get( `session` ).owner_id ).read_snapshot( name )
    if( json === null ) return c.json( { error: `Not found` }, 404 )
    return new Response( json, { headers: {
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

    // Nightly backup of every account (e2e tenants never exist in prod)
    async scheduled( event, env ) {
        const auth = env.AUTH.get( env.AUTH.idFromName( `auth:default` ) )
        for( const user_id of await auth.user_ids() ) {
            await sync_of( env, user_id ).take_snapshot().catch( error => console.error( `backup ${ user_id }:`, error?.message ) )
        }
    },
}
