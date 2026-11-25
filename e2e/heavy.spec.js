import { expect, test } from '@playwright/test'
import { ENROLLMENT_CODE } from '../playwright.config.js'

// Heavy tests: own project, run after the rest (they saturate the single local wrangler dev server)

const status = page => page.getByLabel( `Sync status` )

// A browser of this test's owner. Closed after each test: open sockets pile up otherwise, and WebKit's
// per-host connection pool runs dry (later requests just queue)
const opened = []
test.afterEach( async () => {
    await Promise.all( opened.splice( 0 ).map( context => context.close() ) )
} )
const device = async ( browser, tenant ) => {
    const context = await browser.newContext()
    opened.push( context )
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

test( `a first sync well over 1 MB arrives complete`, async ( { browser } ) => {
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

