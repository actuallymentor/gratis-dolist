import { expect, test } from '@playwright/test'

// M3: capture anywhere (PWA). Start URL, shortcut and share target all land on /capture.

const quick_add = page => page.getByRole( `textbox`, { name: `New task` } )

test( `the manifest launches into capture, with a shortcut and a share target`, async ( { request } ) => {
    const manifest = await ( await request.get( `/manifest.webmanifest` ) ).json()
    expect( manifest ).toMatchObject( { id: `/`, start_url: `/capture`, share_target: { action: `/capture`, method: `GET` } } )
    expect( manifest.shortcuts.map( ( { url } ) => url ) ).toContain( `/capture` )
} )

test( `capture opens focused, adds to the Inbox, lists what was added`, async ( { page } ) => {
    const started = Date.now()
    await page.goto( `/capture` )
    await expect( quick_add( page ) ).toBeFocused()
    expect( Date.now() - started ).toBeLessThan( 1_500 )

    await quick_add( page ).fill( `Buy stamps` )
    await quick_add( page ).press( `Enter` )
    await expect( page.getByLabel( `Just added` ) ).toContainText( `Buy stamps` )
    await page.goto( `/inbox` )
    await expect( page.getByRole( `button`, { name: `Buy stamps` } ) ).toBeVisible()
} )

test( `shared text arrives prefilled, literal, and only once`, async ( { page } ) => {
    await page.goto( `/capture?title=${ encodeURIComponent( `Read #1 tips` ) }&url=${ encodeURIComponent( `https://example.com/a` ) }` )
    await expect( quick_add( page ) ).toHaveValue( `"Read #1 tips" https://example.com/a` )
    await expect( page ).toHaveURL( /\/capture$/ )

    // A reload keeps the draft but doesn't add the share again
    await page.reload()
    await expect( quick_add( page ) ).toHaveValue( `"Read #1 tips" https://example.com/a` )
    await quick_add( page ).press( `Enter` )
    await page.goto( `/search?q=tips` )
    await expect( page.getByRole( `button`, { name: /Read #1 tips/ } ) ).toBeVisible()
} )

test( `accessory row inserts tokens without losing focus`, async ( { page } ) => {
    await page.goto( `/capture` )
    await quick_add( page ).fill( `Call mum` )
    const row = page.getByRole( `toolbar`, { name: `Insert` } )
    await row.getByRole( `button`, { name: `Priority` } ).click()
    await page.keyboard.type( `1` )
    await row.getByRole( `button`, { name: `Deadline` } ).click()
    await page.keyboard.type( `fri` )
    await expect( quick_add( page ) ).toHaveValue( `Call mum !1 by fri` )
    await expect( quick_add( page ) ).toBeFocused()
    await expect( page.getByLabel( `Understood` ) ).toContainText( `!1` )
} )

test( `iOS shows Add to Home Screen in Settings, never a floating pill`, async ( { page }, { project } ) => {
    test.skip( project.name !== `iphone`, `iOS only` )
    await page.goto( `/today` )
    await expect( page.getByRole( `button`, { name: `Install app` } ) ).toHaveCount( 0 )
    await page.goto( `/settings` )
    await expect( page.getByLabel( `Install on iPhone` ) ).toContainText( `Add to Home Screen` )
} )
