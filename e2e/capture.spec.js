import { expect, test } from '@playwright/test'

// M3: capture anywhere (PWA). Start URL, shortcut and share target all land on /capture.

const quick_add = page => page.getByRole( `textbox`, { name: `New task` } )

test( `the manifest launches into capture, with a shortcut and a share target`, async ( { request } ) => {
    const manifest = await ( await request.get( `/manifest.webmanifest` ) ).json()
    expect( manifest ).toMatchObject( { id: `/`, start_url: `/capture`, share_target: { action: `/capture`, method: `GET` } } )
    expect( manifest.shortcuts.map( ( { url } ) => url ) ).toContain( `/capture` )
} )

test( `capture opens focused, adds to Triage, lists what was added`, async ( { page } ) => {
    const started = Date.now()
    await page.goto( `/capture` )
    await expect( quick_add( page ) ).toBeFocused()
    expect( Date.now() - started ).toBeLessThan( 1_500 )

    await quick_add( page ).fill( `Buy stamps` )
    await quick_add( page ).press( `Enter` )
    await expect( page.getByLabel( `Just added` ) ).toContainText( `Buy stamps` )
    await page.goto( `/triage` )
    await expect( page.getByRole( `button`, { name: `Buy stamps` } ) ).toBeVisible()
} )

test( `a share is its own literal task, kept until added, never mixed into the draft`, async ( { page } ) => {
    await page.goto( `/capture` )
    await quick_add( page ).fill( `Buy milk tomorrow` )

    await page.goto( `/capture?title=${ encodeURIComponent( `Read #home tomorrow !1` ) }&url=${ encodeURIComponent( `https://example.com/a` ) }` )
    const card = page.getByRole( `form`, { name: `Shared` } )
    await expect( card.getByLabel( `Shared task title` ) ).toHaveValue( `Read #home tomorrow !1` )
    await expect( quick_add( page ) ).toHaveValue( `Buy milk tomorrow` )

    // Edits survive a reload, and leaving for Triage and coming back keeps the card
    await card.getByLabel( `Shared task title` ).fill( `Read later #home tomorrow !1` )
    await page.reload()
    await page.getByRole( `link`, { name: `Triage` } ).first().click()
    await page.goto( `/capture` )
    await expect( card.getByLabel( `Shared task title` ) ).toHaveValue( `Read later #home tomorrow !1` )
    await card.getByRole( `button`, { name: `Add shared task` } ).click()
    await expect( page.getByLabel( `Just added` ) ).toContainText( `Read later #home tomorrow !1` )
    await expect( card ).toHaveCount( 0 )
    await page.reload()
    await expect( card ).toHaveCount( 0 )
    await expect( quick_add( page ) ).toHaveValue( `Buy milk tomorrow` )

    await page.goto( `/triage` )
    await page.getByRole( `button`, { name: `Read later #home tomorrow !1` } ).click()
    await expect( page.getByRole( `dialog` ).getByLabel( `Notes` ) ).toHaveValue( `https://example.com/a` )
    await expect( page.getByRole( `dialog` ).getByLabel( `Scheduled` ) ).toHaveValue( `` )
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
    await page.goto( `/horizons` )
    await expect( page.getByRole( `button`, { name: `Install app` } ) ).toHaveCount( 0 )
    await page.goto( `/settings` )
    await expect( page.getByLabel( `Install on iPhone` ) ).toContainText( `Add to Home Screen` )
} )

test( `the same share added twice (history, second tab) is still one task`, async ( { page, context } ) => {
    const url = `/capture?title=${ encodeURIComponent( `Only once please` ) }`
    await page.goto( url )
    await page.getByRole( `button`, { name: `Add shared task` } ).click()
    await expect( page.getByLabel( `Just added` ) ).toContainText( `Only once please` )

    // Edit it, then back through history and in another tab: still one task, edits kept
    await page.goto( `/triage` )
    await page.getByRole( `button`, { name: `Only once please` } ).click()
    await page.getByRole( `dialog` ).getByLabel( `Notes` ).fill( `my research` )
    await page.keyboard.press( `Escape` )
    await expect( page.getByRole( `dialog` ) ).toHaveCount( 0 )
    await page.waitForTimeout( 300 )
    await page.goto( url )
    await page.getByRole( `button`, { name: `Add shared task` } ).click()
    const other = await context.newPage()
    await other.goto( url )
    await other.getByRole( `button`, { name: `Add shared task` } ).click()
    await expect( other.getByLabel( `Just added` ) ).toBeVisible()

    await page.goto( `/triage` )
    await expect( page.getByRole( `button`, { name: `Only once please` } ) ).toHaveCount( 1 )
    await page.getByRole( `button`, { name: `Only once please` } ).click()
    await expect( page.getByRole( `dialog` ).getByLabel( `Notes` ) ).toHaveValue( `my research` )
} )

test( `a deleted share comes back when shared again`, async ( { page } ) => {
    const url = `/capture?title=${ encodeURIComponent( `Bring me back` ) }`
    await page.goto( url )
    await page.getByRole( `button`, { name: `Add shared task` } ).click()
    await expect( page.getByLabel( `Just added` ) ).toContainText( `Bring me back` )

    await page.goto( `/triage` )
    await page.getByRole( `button`, { name: `Bring me back` } ).click()
    await page.getByRole( `button`, { name: `Delete task` } ).click()
    await expect( page.getByRole( `button`, { name: `Bring me back` } ) ).toHaveCount( 0 )
    await page.waitForTimeout( 300 )

    await page.goto( url )
    await page.getByRole( `button`, { name: `Add shared task` } ).click()
    await expect( page.getByText( `Brought back from deleted` ) ).toBeVisible()
    await page.goto( `/triage` )
    await expect( page.getByRole( `button`, { name: `Bring me back` } ) ).toHaveCount( 1 )
} )
