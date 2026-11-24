import { expect, test } from '@playwright/test'

// M1 daily core, driven like a user. Each test gets a fresh browser context (empty IndexedDB).

const quick_add = page => page.getByRole( `textbox`, { name: `New task` } )

const add = async ( page, text ) => {
    await quick_add( page ).fill( text )
    await quick_add( page ).press( `Enter` )
}

test( `capture with grammar lands in the right lists`, async ( { page } ) => {

    await page.goto( `/inbox` )
    await quick_add( page ).fill( `Call mum today !1 @calls` )

    // Live chips show what was understood before submitting
    await expect( page.getByLabel( `Understood` ).getByText( `!1`, { exact: true } ) ).toBeVisible()
    await quick_add( page ).press( `Enter` )

    // Unknown label: first Enter offers, second creates
    await expect( page.getByRole( `status` ).filter( { hasText: `Enter again to create` } ) ).toBeVisible()
    await quick_add( page ).press( `Enter` )
    await expect( quick_add( page ) ).toHaveValue( `` )

    await expect( page.getByRole( `button`, { name: `Call mum` } ) ).toBeVisible()
    await page.goto( `/today` )
    await expect( page.getByRole( `button`, { name: `Call mum` } ) ).toBeVisible()

} )

test( `capture survives an immediate reload; drafts persist`, async ( { page } ) => {

    await page.goto( `/inbox` )
    await add( page, `Buy sunscreen` )
    await expect( page.getByRole( `button`, { name: `Buy sunscreen` } ) ).toBeVisible()
    await quick_add( page ).fill( `half typed thought` )

    await page.reload()
    await expect( page.getByRole( `button`, { name: `Buy sunscreen` } ) ).toBeVisible()
    await expect( quick_add( page ) ).toHaveValue( `half typed thought` )

} )

test( `complete with undo, then reopen from history`, async ( { page } ) => {

    await page.goto( `/inbox` )
    await add( page, `Water plants` )
    await page.getByRole( `checkbox`, { name: `Complete Water plants` } ).click()
    await expect( page.getByRole( `button`, { name: `Water plants` } ) ).toHaveCount( 0 )

    await page.getByRole( `button`, { name: `Undo` } ).click()
    await expect( page.getByRole( `button`, { name: `Water plants` } ) ).toBeVisible()

    await page.getByRole( `checkbox`, { name: `Complete Water plants` } ).click()

    // The toast is the durable ack: once it shows, a reload must keep the completion
    await expect( page.getByText( `Completed “Water plants”` ).last() ).toBeVisible()
    await page.goto( `/completed` )
    await page.getByRole( `button`, { name: `Reopen` } ).click()
    await page.goto( `/inbox` )
    await expect( page.getByRole( `button`, { name: `Water plants` } ) ).toBeVisible()

} )

test( `task detail edits fields and survives reload`, async ( { page } ) => {

    await page.goto( `/inbox` )
    await add( page, `Draft report` )
    await page.getByRole( `button`, { name: `Draft report` } ).click()

    const panel = page.getByRole( `dialog`, { name: /Task: Draft report/ } )
    await panel.getByLabel( `Notes` ).fill( `Use the Q3 numbers` )
    await panel.getByLabel( `Priority` ).selectOption( `2` )
    await panel.getByLabel( `Deadline` ).fill( `2030-01-15` )
    await panel.getByLabel( `Title` ).click()

    await page.reload()
    await expect( panel ).toBeVisible()
    await expect( panel.getByLabel( `Notes` ) ).toHaveValue( `Use the Q3 numbers` )
    await expect( panel.getByLabel( `Priority` ) ).toHaveValue( `2` )

    await page.keyboard.press( `Escape` )
    await expect( panel ).toHaveCount( 0 )

} )

test( `search finds titles and notes`, async ( { page } ) => {

    await page.goto( `/inbox` )
    await add( page, `Renew passport` )
    await page.goto( `/search?q=passport` )
    await expect( page.getByRole( `button`, { name: `Renew passport` } ) ).toBeVisible()
    await page.getByRole( `searchbox` ).fill( `zebra` )
    await expect( page.getByText( `No matches` ) ).toBeVisible()

} )

test( `Horizons: keyboard Move command reschedules`, async ( { page } ) => {

    await page.goto( `/inbox` )
    await add( page, `Plan trip today` )
    await page.goto( `/horizons` )

    const today_lane = page.getByRole( `region`, { name: `Today` } )
    await expect( today_lane.getByRole( `button`, { name: `Plan trip` } ) ).toBeVisible()

    await today_lane.getByRole( `button`, { name: `Plan trip` } ).focus()
    await page.keyboard.press( `m` )
    await page.getByRole( `menuitem`, { name: /This month/ } ).click()
    await expect( page.getByRole( `region`, { name: `This month` } ).getByRole( `button`, { name: `Plan trip` } ) ).toBeVisible()

} )

test( `export then import round-trips`, async ( { page, browser } ) => {

    await page.goto( `/inbox` )
    await add( page, `Exported task` )
    await page.goto( `/settings` )
    const [ download ] = await Promise.all( [ page.waitForEvent( `download` ), page.getByRole( `button`, { name: `Export` } ).click() ] )
    const file = await download.path()

    // Fresh, empty browser profile imports the file
    const fresh = await ( await browser.newContext() ).newPage()
    await fresh.goto( `/settings` )
    await fresh.getByLabel( `Import file` ).setInputFiles( file )
    await expect( fresh.getByText( `Imported` ) ).toBeVisible()
    await fresh.goto( `/inbox` )
    await expect( fresh.getByRole( `button`, { name: `Exported task` } ) ).toBeVisible()

} )

test( `offline capture works`, async ( { page, context } ) => {

    await page.goto( `/inbox` )
    await page.evaluate( () => navigator.serviceWorker.ready )
    await page.reload()
    await context.setOffline( true )
    await page.reload()
    await add( page, `Offline idea` )
    await expect( page.getByRole( `button`, { name: `Offline idea` } ) ).toBeVisible()
    await context.setOffline( false )

} )

test( `? opens the cheatsheet`, async ( { page } ) => {
    await page.goto( `/horizons` )
    await expect( page.getByRole( `region`, { name: `Today` } ) ).toBeVisible()
    await page.keyboard.press( `?` )
    await expect( page.getByRole( `dialog`, { name: `Cheatsheet` } ) ).toBeVisible()
    await page.keyboard.press( `Escape` )
    await expect( page.getByRole( `dialog`, { name: `Cheatsheet` } ) ).toHaveCount( 0 )
} )
