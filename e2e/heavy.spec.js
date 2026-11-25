import { expect, test } from '@playwright/test'
import { close_devices, device, new_email, sign_in_by_link, tenant } from './account.js'

// Heavy tests: own project, run after the rest (they saturate the single local wrangler dev server)

test.afterEach( close_devices )

test( `a first sync well over 1 MB arrives complete`, async ( { browser } ) => {
    const id = tenant()
    const email = new_email()
    const a = await device( browser, id )
    await sign_in_by_link( a.page, email )

    // ~3 MB of tasks with notes, imported on A while it syncs
    const tasks = Object.fromEntries( Array.from( { length: 3_000 }, ( _, i ) => [ `bulk-${ i }`, { title: `Bulk ${ i }`, notes: `x`.repeat( 600 ), created_at: 1_700_000_000_000 + i } ] ) )
    const file = test.info().outputPath( `bulk.json` )
    await import( `node:fs` ).then( fs => fs.writeFileSync( file, JSON.stringify( { app: `dolist`, schema: 1, tables: { tasks } } ) ) )
    await a.page.getByLabel( `Import file` ).setInputFiles( file )
    await expect( a.page.getByText( `Imported` ) ).toBeVisible( { timeout: 20_000 } )

    // A brand-new device pulls all of it
    const b = await device( browser, id )
    await sign_in_by_link( b.page, email )
    await b.page.goto( `/search?q=Bulk 2999` )
    await expect( b.page.getByRole( `button`, { name: `Bulk 2999` } ) ).toBeVisible( { timeout: 30_000 } )
    await b.page.goto( `/search?q=Bulk 0` )
    await expect( b.page.getByRole( `button`, { name: `Bulk 0`, exact: true } ) ).toBeVisible()
} )

