import { expect, test } from '@playwright/test'
import { ENROLLMENT_CODE } from '../playwright.config.js'

// M2 exit criteria against real wrangler dev (Worker + Auth/Sync DOs + local R2).
// Each test is its own owner: the E2E-only `dolist_tenant` cookie picks an isolated Auth DO.

const quick_add = page => page.getByRole( `textbox`, { name: `New task` } )
const add = async ( page, text ) => {
    await quick_add( page ).fill( text )
    await quick_add( page ).press( `Enter` )
}
const status = page => page.getByLabel( `Sync status` )

// A browser of this test's owner
const device = async ( browser, tenant ) => {
    const context = await browser.newContext()
    await context.addCookies( [ { name: `dolist_tenant`, value: tenant, url: `http://localhost:8787` } ] )
    return { context, page: await context.newPage() }
}

const sign_in = async ( page, code ) => {
    await page.goto( `/settings` )
    await page.getByLabel( `Sign-in code` ).fill( code )
    await page.getByRole( `button`, { name: `Sign in` } ).click()
}

// First device: enrollment, returns the recovery codes shown once
const enroll = async page => {
    await sign_in( page, ENROLLMENT_CODE )
    const codes = ( await page.getByLabel( `Recovery codes` ).textContent() ).split( `\n` )
    await page.getByRole( `button`, { name: `I saved them` } ).click()
    await expect( status( page ) ).toHaveText( `Synced` )
    return codes
}

const pair = async ( from, to ) => {
    await from.getByRole( `button`, { name: `Pair` } ).click()
    const code = await from.getByLabel( `Pairing code` ).textContent()
    await sign_in( to, code )
    await expect( status( to ) ).toHaveText( `Synced` )
}

const owner = () => crypto.randomUUID()

test( `two browsers sync, including offline edits on both sides`, async ( { browser } ) => {
    const tenant = owner()
    const a = await device( browser, tenant )
    const b = await device( browser, tenant )
    const codes = await enroll( a.page )
    expect( codes ).toHaveLength( 10 )
    await pair( a.page, b.page )

    // Online: A → B
    await a.page.goto( `/inbox` )
    await add( a.page, `Written on A` )
    await b.page.goto( `/inbox` )
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
    const tenant = owner()
    const a = await device( browser, tenant )
    const b = await device( browser, tenant )
    await enroll( a.page )
    await pair( a.page, b.page )

    await a.page.reload()
    await a.page.getByRole( `button`, { name: /^Sign out .+/ } ).click()
    await expect( b.page.getByText( `This device was signed out` ) ).toBeVisible( { timeout: 5_000 } )

    // Pairing codes are single-use; the revoked device can't come back on its own
    await b.page.goto( `/inbox` )
    await add( b.page, `Still local` )
    await expect( b.page.getByRole( `button`, { name: `Still local` } ) ).toBeVisible()
} )

test( `recovery codes sign in once`, async ( { browser } ) => {
    const tenant = owner()
    const a = await device( browser, tenant )
    const [ first ] = await enroll( a.page )

    const lost = await device( browser, tenant )
    await sign_in( lost.page, first.toLowerCase() )
    await expect( status( lost.page ) ).toHaveText( `Synced` )

    const again = await device( browser, tenant )
    await sign_in( again.page, first )
    await expect( again.page.getByText( `That code didn't work` ) ).toBeVisible()
} )

test( `backup now, download, import into an empty browser = restore`, async ( { browser } ) => {
    const tenant = owner()
    const a = await device( browser, tenant )
    await enroll( a.page )
    await a.page.goto( `/inbox` )
    await add( a.page, `Backed up task` )
    await expect( a.page.getByRole( `button`, { name: `Backed up task` } ) ).toBeVisible()

    await a.page.goto( `/settings` )
    await expect( status( a.page ) ).toHaveText( `Synced` )
    await a.page.waitForTimeout( 500 )
    await a.page.getByRole( `button`, { name: `Back up now` } ).click()
    const [ download ] = await Promise.all( [ a.page.waitForEvent( `download` ), a.page.getByRole( `link`, { name: /Download backup/ } ).first().click() ] )
    const file = await download.path()

    const fresh = await ( await browser.newContext() ).newPage()
    await fresh.goto( `/settings` )
    await fresh.getByLabel( `Import file` ).setInputFiles( file )
    await expect( fresh.getByText( `Imported` ) ).toBeVisible()
    await fresh.goto( `/inbox` )
    await expect( fresh.getByRole( `button`, { name: `Backed up task` } ) ).toBeVisible()
} )

test( `the API refuses other origins and signed-out callers`, async ( { request } ) => {
    expect( ( await request.post( `/api/login`, { data: { code: ENROLLMENT_CODE }, headers: { Origin: `https://evil.example` } } ) ).status() ).toBe( 403 )
    expect( ( await request.get( `/api/devices` ) ).status() ).toBe( 401 )
    expect( ( await request.get( `/api/snapshots` ) ).status() ).toBe( 401 )
} )

test( `a first sync well over 1 MB arrives complete`, async ( { browser }, { project } ) => {
    test.skip( project.name !== `desktop`, `payload size is browser-independent` )
    const tenant = owner()
    const a = await device( browser, tenant )
    await enroll( a.page )

    // ~3 MB of tasks with notes, imported on A while it syncs
    const tasks = Object.fromEntries( Array.from( { length: 3_000 }, ( _, i ) => [ `bulk-${ i }`, { title: `Bulk ${ i }`, notes: `x`.repeat( 600 ), created_at: 1_700_000_000_000 + i } ] ) )
    const file = test.info().outputPath( `bulk.json` )
    await import( `node:fs` ).then( fs => fs.writeFileSync( file, JSON.stringify( { app: `dolist`, schema: 1, tables: { tasks } } ) ) )
    await a.page.getByLabel( `Import file` ).setInputFiles( file )
    await expect( a.page.getByText( `Imported` ) ).toBeVisible( { timeout: 20_000 } )

    // A brand-new device pulls all of it
    const b = await device( browser, tenant )
    await pair( a.page, b.page )
    await b.page.goto( `/search?q=Bulk 2999` )
    await expect( b.page.getByRole( `button`, { name: `Bulk 2999` } ) ).toBeVisible( { timeout: 30_000 } )
    await b.page.goto( `/search?q=Bulk 0` )
    await expect( b.page.getByRole( `button`, { name: `Bulk 0`, exact: true } ) ).toBeVisible()
} )

test( `a session revoked mid-reconnect stays out`, async ( { browser } ) => {
    const tenant = owner()
    const a = await device( browser, tenant )
    const b = await device( browser, tenant )
    await enroll( a.page )
    await pair( a.page, b.page )

    // B goes offline (socket dropped), gets revoked meanwhile, then comes back
    await b.context.setOffline( true )
    await a.page.reload()
    await a.page.getByRole( `button`, { name: /^Sign out .+/ } ).click()
    await b.context.setOffline( false )
    await expect( b.page.getByText( `This device was signed out` ) ).toBeVisible( { timeout: 10_000 } )
} )

test( `signing in one tab starts sync in the other open tabs`, async ( { browser } ) => {
    const a = await device( browser, owner() )
    const sibling = await a.context.newPage()
    await sibling.goto( `/settings` )
    await enroll( a.page )
    await expect( status( sibling ) ).toHaveText( `Synced` )
} )

test( `a lost enrollment response can be retried`, async ( { browser, request } ) => {
    const tenant = owner()

    // Enroll from outside the browser and drop the response (no cookie, no recovery codes)
    const lost = await request.post( `/api/login`, { data: { code: ENROLLMENT_CODE }, headers: { Origin: `http://localhost:8787`, Cookie: `dolist_tenant=${ tenant }` } } )
    expect( lost.status() ).toBe( 200 )

    // The real browser enrolls again and gets a working owner
    const a = await device( browser, tenant )
    expect( await enroll( a.page ) ).toHaveLength( 10 )

    // Now it's closed
    const late = await device( browser, tenant )
    await sign_in( late.page, ENROLLMENT_CODE )
    await expect( late.page.getByText( `That code didn't work` ) ).toBeVisible()
} )

test( `new recovery codes void the old ones`, async ( { browser } ) => {
    const tenant = owner()
    const a = await device( browser, tenant )
    const [ old_code ] = await enroll( a.page )
    await a.page.getByRole( `button`, { name: `New codes` } ).click()
    const [ new_code ] = ( await a.page.getByLabel( `Recovery codes` ).textContent() ).split( `\n` )

    const b = await device( browser, tenant )
    await sign_in( b.page, old_code )
    await expect( b.page.getByText( `That code didn't work` ) ).toBeVisible()
    await sign_in( b.page, new_code )
    await expect( status( b.page ) ).toHaveText( `Synced` )
} )
