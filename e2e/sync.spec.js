import { expect, test } from '@playwright/test'
import { authenticator, close_devices, device, mail, new_email, request_link, sign_in_by_code, sign_in_by_link, status, tenant } from './account.js'
import { SKIP_WELCOME } from './welcome.js'
import { add } from './ui.js'

// M2 exit criteria against real wrangler dev (Worker + Auth/Sync DOs), signing in like a person:
// email link (or its code), passkeys. Each test is its own deployment (see ./account.js).

test.afterEach( close_devices )

// The capture page's inline box
const capture_box = page => page.getByRole( `textbox`, { name: `New task` } )

// Two browsers on one account
const two_devices = async browser => {
    const id = tenant()
    const email = new_email()
    const a = await device( browser, id )
    const b = await device( browser, id )
    await sign_in_by_link( a.page, email )
    await sign_in_by_link( b.page, email )
    return { a, b, email, id }
}

test( `two browsers sync, including offline edits on both sides`, async ( { browser } ) => {
    const { a, b } = await two_devices( browser )

    // Online: A → B
    await a.page.goto( `/triage` )
    await add( a.page, `Written on A` )
    await b.page.goto( `/triage` )
    await expect( b.page.getByRole( `button`, { name: `Written on A` } ) ).toBeVisible()

    // Offline on both, then reconnect: both edits everywhere
    await a.context.setOffline( true )
    await b.context.setOffline( true )
    await add( a.page, `Offline on A` )
    await add( b.page, `Offline on B` )

    // Really offline: nothing crosses yet
    await b.page.waitForTimeout( 1_000 )
    await expect( b.page.getByRole( `button`, { name: `Offline on A` } ) ).toHaveCount( 0 )
    await a.context.setOffline( false )
    await b.context.setOffline( false )
    for( const { page } of [ a, b ] ) {
        await expect( page.getByRole( `button`, { name: `Offline on A` } ) ).toBeVisible( { timeout: 20_000 } )
        await expect( page.getByRole( `button`, { name: `Offline on B` } ) ).toBeVisible( { timeout: 20_000 } )
    }
} )

test( `a revoked device drops within seconds and keeps its tasks`, async ( { browser } ) => {
    const { a, b } = await two_devices( browser )

    await a.page.reload()
    await a.page.getByRole( `button`, { name: /^Sign out .+/ } ).click()
    await expect( b.page.getByText( `This device was signed out` ) ).toBeVisible( { timeout: 5_000 } )

    // Its tasks stay; it can't come back without signing in again
    await b.page.goto( `/triage` )
    await add( b.page, `Still local` )
    await expect( b.page.getByRole( `button`, { name: `Still local` } ) ).toBeVisible()
} )

test( `an email link signs up, then signs in; it works once`, async ( { browser } ) => {
    const id = tenant()
    const email = new_email()
    const a = await device( browser, id )
    await request_link( a.page, email )
    const { link } = await mail( a.page, email )
    await a.page.goto( link )
    await expect( a.page.getByRole( `heading`, { name: `Signed in` } ) ).toBeVisible()
    await expect( a.page ).not.toHaveURL( /token=/ )

    // Used: a second browser opening the same link gets nothing. It never asked for a link, so it asks first
    const b = await device( browser, id )
    await b.page.goto( link )
    await expect( b.page.getByRole( `heading`, { name: `Finish signing in?` } ) ).toBeVisible()
    await b.page.getByRole( `button`, { name: `Continue` } ).click()
    await expect( b.page.getByText( `That link or code didn't work` ) ).toBeVisible()
} )

test( `the emailed code signs in where the link can't open (installed app)`, async ( { browser } ) => {
    const { a, email, id } = await two_devices( browser )
    await a.page.goto( `/triage` )
    await add( a.page, `From the browser` )

    const app = await device( browser, id )
    await sign_in_by_code( app.page, email )
    await app.page.goto( `/triage` )
    await expect( app.page.getByRole( `button`, { name: `From the browser` } ) ).toBeVisible()
} )

test( `five wrong codes kill the code, not the link`, async ( { browser, browserName } ) => {
    // A server rule: one engine is enough. WebKit stalls on bursts of requests to wrangler dev (GOTCHAS)
    test.skip( browserName === `webkit`, `server rule, Chromium covers it` )
    const email = new_email()
    const a = await device( browser, tenant() )
    await request_link( a.page, email )
    const { code } = await mail( a.page, email )
    // Each try gets its answer before the next; all six are refused (the last, right one, too late)
    for( const attempt of [ `WRONG-0`, `WRONG-1`, `WRONG-2`, `WRONG-3`, `WRONG-4`, code ] ) {
        await a.page.getByLabel( `Code from the email` ).fill( attempt )
        const [ response ] = await Promise.all( [
            a.page.waitForResponse( response => response.url().includes( `/api/login/email` ) ),
            a.page.getByRole( `button`, { name: `Sign in`, exact: true } ).click(),
        ] )
        expect( response.status() ).toBe( 401 )
    }
    await expect( a.page.getByRole( `heading`, { name: `Signed in` } ) ).toHaveCount( 0 )

    // The link in the inbox still works
    await a.page.goto( ( await mail( a.page, email ) ).link )
    await expect( a.page.getByRole( `heading`, { name: `Signed in` } ) ).toBeVisible()
} )

test( `another account never receives the tasks already on this device`, async ( { browser } ) => {
    const id = tenant()
    const first = new_email()
    const second = new_email()
    const a = await device( browser, id )
    await sign_in_by_link( a.page, first )
    await a.page.goto( `/triage` )
    await add( a.page, `Belongs to the first account` )

    // Sign out, sign in as someone else: their sync stays off, nothing crosses
    await a.page.goto( `/settings` )
    await a.page.getByRole( `button`, { name: `Sign out`, exact: true } ).click()
    await expect( a.page.getByText( `Signed out. Your tasks stay on this device.` ) ).toBeVisible()
    await request_link( a.page, second )
    await a.page.goto( ( await mail( a.page, second ) ).link )
    await a.page.getByRole( `button`, { name: `Not now` } ).click()
    await expect( status( a.page ) ).toHaveText( /another account/ )

    const b = await device( browser, id )
    await sign_in_by_link( b.page, second )
    await b.page.goto( `/triage` )
    await b.page.waitForTimeout( 1_000 )
    await expect( b.page.getByRole( `button`, { name: `Belongs to the first account` } ) ).toHaveCount( 0 )

    // Handing the device over removes the first account's tasks here and syncs the second
    await add( b.page, `Second account task` )
    a.page.once( `dialog`, dialog => dialog.accept() )
    await a.page.getByRole( `button`, { name: `Use this account here` } ).click()
    await expect( status( a.page ) ).toHaveText( `Synced` )
    await a.page.goto( `/triage` )
    await expect( a.page.getByRole( `button`, { name: `Second account task` } ) ).toBeVisible()
    await expect( a.page.getByRole( `button`, { name: `Belongs to the first account` } ) ).toHaveCount( 0 )

    // …and the first account still has them
    const c = await device( browser, id )
    await sign_in_by_link( c.page, first )
    await c.page.goto( `/triage` )
    await expect( c.page.getByRole( `button`, { name: `Belongs to the first account` } ) ).toBeVisible()
} )

test( `a passkey creates an account, and signs back in after signing out`, async ( { browser, browserName } ) => {
    test.skip( browserName !== `chromium`, `virtual authenticator is Chromium-only` )
    const a = await device( browser, tenant() )
    await a.page.goto( `/signin` )
    await authenticator( a.page )
    await a.page.getByRole( `button`, { name: `Create an account with a passkey` } ).click()
    await expect( status( a.page ) ).toHaveText( `Synced` )
    await expect( a.page.getByText( /^Passkey: / ) ).toBeVisible()

    // The only way in: can't be removed
    await a.page.getByRole( `button`, { name: /^Remove passkey/ } ).click()
    await expect( a.page.getByText( `This is your only way to sign in` ) ).toBeVisible()

    await a.page.getByRole( `button`, { name: `Sign out`, exact: true } ).click()
    await expect( a.page.getByText( `Signed out. Your tasks stay on this device.` ) ).toBeVisible()
    await a.page.goto( `/signin` )
    await a.page.getByRole( `button`, { name: `Sign in with a passkey` } ).click()
    await expect( status( a.page ) ).toHaveText( `Synced` )
} )

test( `a passkey added after email sign-in signs in another device`, async ( { browser, browserName } ) => {
    test.skip( browserName !== `chromium`, `virtual authenticator is Chromium-only` )
    const id = tenant()
    const email = new_email()
    const a = await device( browser, id )
    const key = await authenticator( a.page )
    await request_link( a.page, email )
    await a.page.goto( ( await mail( a.page, email ) ).link )
    await a.page.getByRole( `button`, { name: `Add a passkey` } ).click()
    await expect( status( a.page ) ).toHaveText( `Synced` )
    await a.page.goto( `/triage` )
    await add( a.page, `Before the passkey device` )

    // A synced passkey (password manager) shows up on another device
    const { credentials } = await key.cdp.send( `WebAuthn.getCredentials`, { authenticatorId: key.id } )
    const b = await device( browser, id )
    await b.page.goto( `/signin` )
    const other = await authenticator( b.page )
    await other.cdp.send( `WebAuthn.addCredential`, { authenticatorId: other.id, credential: credentials[ 0 ] } )
    await b.page.getByRole( `button`, { name: `Sign in with a passkey` } ).click()
    await expect( status( b.page ) ).toHaveText( `Synced` )
    await b.page.goto( `/triage` )
    await expect( b.page.getByRole( `button`, { name: `Before the passkey device` } ) ).toBeVisible()
} )

test( `a passkey account adds an email, confirmed by code`, async ( { browser, browserName } ) => {
    test.skip( browserName !== `chromium`, `virtual authenticator is Chromium-only` )
    const id = tenant()
    const email = new_email()
    const a = await device( browser, id )
    await a.page.goto( `/signin` )
    await authenticator( a.page )
    await a.page.getByRole( `button`, { name: `Create an account with a passkey` } ).click()
    await expect( status( a.page ) ).toHaveText( `Synced` )

    await a.page.getByLabel( `New email` ).fill( email )
    await a.page.getByRole( `button`, { name: `Add email` } ).click()
    await expect( a.page.getByLabel( `Code from the email` ) ).toBeVisible()
    await a.page.getByLabel( `Code from the email` ).fill( ( await mail( a.page, email ) ).code )
    await a.page.getByRole( `button`, { name: `Confirm` } ).click()
    await expect( a.page.getByText( `Email added` ) ).toBeVisible()
    await expect( a.page.getByText( email ) ).toBeVisible()

    // Now that email signs in to the same account
    const b = await device( browser, id )
    await sign_in_by_link( b.page, email )
    await expect( b.page.getByText( /^Passkey: / ) ).toBeVisible()
} )

test( `backup now, download, import into an empty browser = restore`, async ( { browser } ) => {
    const a = await device( browser, tenant() )
    await sign_in_by_link( a.page, new_email() )
    await a.page.goto( `/triage` )
    await add( a.page, `Backed up task` )
    await expect( a.page.getByRole( `button`, { name: `Backed up task` } ) ).toBeVisible()

    await a.page.goto( `/settings` )
    await expect( status( a.page ) ).toHaveText( `Synced` )
    await a.page.waitForTimeout( 500 )
    await a.page.getByRole( `button`, { name: `Back up now` } ).click()
    const [ download ] = await Promise.all( [ a.page.waitForEvent( `download` ), a.page.getByRole( `link`, { name: /Download backup/ } ).first().click() ] )
    const file = await download.path()

    const fresh = await ( await browser.newContext( { storageState: SKIP_WELCOME } ) ).newPage()
    await fresh.goto( `/settings` )
    await fresh.getByLabel( `Import file` ).setInputFiles( file )
    await expect( fresh.getByText( `Imported` ) ).toBeVisible()
    await fresh.goto( `/triage` )
    await expect( fresh.getByRole( `button`, { name: `Backed up task` } ) ).toBeVisible()
} )

test( `the API refuses other origins and signed-out callers`, async ( { request } ) => {
    expect( ( await request.post( `/api/email-link`, { data: { email: new_email() }, headers: { Origin: `https://evil.example` } } ) ).status() ).toBe( 403 )
    expect( ( await request.post( `/api/login/email`, { data: { token: `nope` }, headers: { Origin: `https://evil.example` } } ) ).status() ).toBe( 403 )
    expect( ( await request.get( `/api/passkeys` ) ).status() ).toBe( 401 )
    expect( ( await request.get( `/api/devices` ) ).status() ).toBe( 401 )
    expect( ( await request.get( `/api/snapshots` ) ).status() ).toBe( 401 )
} )

test( `a session revoked mid-reconnect stays out`, async ( { browser } ) => {
    const { a, b } = await two_devices( browser )

    // B goes offline (socket dropped), gets revoked meanwhile, then comes back
    await b.context.setOffline( true )
    await a.page.reload()
    await a.page.getByRole( `button`, { name: /^Sign out .+/ } ).click()
    await b.context.setOffline( false )
    await expect( b.page.getByText( `This device was signed out` ) ).toBeVisible( { timeout: 10_000 } )
} )

test( `signing in one tab starts sync in the other open tabs`, async ( { browser } ) => {
    const a = await device( browser, tenant() )
    const sibling = await a.context.newPage()
    await sibling.goto( `/settings` )
    await sign_in_by_link( a.page, new_email() )
    await expect( status( sibling ) ).toHaveText( `Synced` )
} )

test( `airplane-mode capture syncs later, exactly once`, async ( { browser } ) => {
    const { a: phone, b: laptop } = await two_devices( browser )

    await phone.page.goto( `/capture` )
    await phone.context.setOffline( true )
    await capture_box( phone.page ).fill( `Captured in the air` )
    await capture_box( phone.page ).press( `Enter` )
    await expect( phone.page.getByLabel( `Just added` ) ).toContainText( `Captured in the air` )

    // Reload while offline too (app shell from the service worker), then land
    await phone.page.reload()
    await phone.context.setOffline( false )

    await laptop.page.goto( `/triage` )
    await expect( laptop.page.getByRole( `button`, { name: `Captured in the air` } ) ).toHaveCount( 1, { timeout: 20_000 } )
    await laptop.page.waitForTimeout( 1_500 )
    await expect( laptop.page.getByRole( `button`, { name: `Captured in the air` } ) ).toHaveCount( 1 )
} )
