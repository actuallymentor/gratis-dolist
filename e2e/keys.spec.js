import { expect, test } from '@playwright/test'
import { add } from './ui.js'

// Keyboard-first flows + shorthand in edited titles. Fresh context per test (empty IndexedDB).

const modal = page => page.getByRole( `dialog`, { name: `New task` } )
const card = ( page, title ) => page.locator( `[data-task-id]`, { has: page.getByRole( `button`, { name: title, exact: true } ) } )

// Add through the global `n` modal; it closes once the task is handed off, the toast follows the durable save
const add_with_n = async ( page, text ) => {
    await page.locator( `body` ).click( { position: { x: 1, y: 1 } } )
    await page.keyboard.press( `n` )
    await modal( page ).getByRole( `textbox`, { name: `New task` } ).fill( text )
    await page.keyboard.press( `Enter` )
    await expect( modal( page ) ).toHaveCount( 0 )
    await expect( page.getByText( /^Added “/ ).last() ).toBeVisible()
}

test.describe( `keyboard`, () => {

    test.skip( ( { isMobile } ) => isMobile, `Hardware keyboard flows are desktop-only` )

    test( `n opens quick add from any page, with its own draft`, async ( { page } ) => {

        await page.goto( `/horizons` )
        await expect( page.getByRole( `heading`, { name: `Horizons` } ) ).toBeVisible()
        await page.keyboard.press( `n` )
        await expect( modal( page ) ).toBeVisible()
        await expect( modal( page ).getByRole( `textbox`, { name: `New task` } ) ).toBeFocused()

        // Escape keeps the draft for next time
        await page.keyboard.type( `half a thought` )
        await page.keyboard.press( `Escape` )
        await expect( modal( page ) ).toHaveCount( 0 )
        await page.keyboard.press( `n` )
        await expect( modal( page ).getByRole( `textbox`, { name: `New task` } ) ).toHaveValue( `half a thought` )
        await page.keyboard.press( `Escape` )

        // Backdrop click closes too
        await page.keyboard.press( `n` )
        await page.mouse.click( 5, 5 )
        await expect( modal( page ) ).toHaveCount( 0 )
    } )

    test( `n highlights shorthand and strips it on save`, async ( { page } ) => {

        await page.goto( `/triage` )
        await page.locator( `body` ).click( { position: { x: 1, y: 1 } } )
        await page.keyboard.press( `n` )
        await modal( page ).getByRole( `textbox`, { name: `New task` } ).fill( `Call mum tom at 5` )
        await expect( modal( page ).locator( `mark` ) ).toHaveText( [ `tom`, `at 5` ] )
        await page.keyboard.press( `Enter` )
        await expect( page.getByText( `Added “Call mum”` ) ).toBeVisible()

        await page.goto( `/horizons` )
        const call = card( page, `Call mum` )
        await expect( call ).toContainText( `Tomorrow` )
        await expect( call ).toContainText( `17:00` )
    } )

    test( `j / k select, Enter opens a centered modal, e completes`, async ( { page } ) => {

        await page.goto( `/triage` )
        for( const title of [ `First`, `Second`, `Third` ] ) await add_with_n( page, title )
        const titles = page.locator( `main [data-task-id] .title, [data-task-id] .title` )
        await expect( titles ).toHaveText( [ `First`, `Second`, `Third` ] )

        await page.locator( `body` ).click( { position: { x: 1, y: 1 } } )
        await page.keyboard.press( `j` )
        await expect( page.getByRole( `button`, { name: `First`, exact: true } ) ).toBeFocused()
        await page.keyboard.press( `j` )
        await page.keyboard.press( `j` )
        await page.keyboard.press( `k` )
        await expect( page.getByRole( `button`, { name: `Second`, exact: true } ) ).toBeFocused()

        // Enter opens the detail as a centered modal
        await page.keyboard.press( `Enter` )
        const detail = page.getByRole( `dialog`, { name: /Task: Second/ } )
        await expect( detail ).toBeVisible()
        const box = await detail.boundingBox()
        const { width } = page.viewportSize()
        expect( Math.abs( box.x + box.width / 2 - width / 2 ) ).toBeLessThan( 4 )

        // Keys don't act behind the dialog
        await page.keyboard.press( `e` )
        await expect( detail ).toBeVisible()
        await page.keyboard.press( `Escape` )
        await expect( detail ).toHaveCount( 0 )

        // e completes the selection and moves it to the neighbour
        await expect( page.getByRole( `button`, { name: `Second`, exact: true } ) ).toBeFocused()
        await page.keyboard.press( `e` )
        await expect( page.getByText( `Completed “Second”` ) ).toBeVisible()
        await expect( titles ).toHaveText( [ `First`, `Third` ] )
        await expect( page.getByRole( `button`, { name: `Third`, exact: true } ) ).toBeFocused()

        // Quick add returns focus to the selection; Tab stays inside the modal
        await page.keyboard.press( `n` )
        await page.keyboard.press( `Tab` )
        await page.keyboard.press( `Tab` )
        await expect( modal( page ).locator( `:focus` ) ).toHaveCount( 1 )
        await page.keyboard.press( `Escape` )
        await expect( page.getByRole( `button`, { name: `Third`, exact: true } ) ).toBeFocused()
    } )
} )

test( `editing a title parses its shorthand and strips it`, async ( { page } ) => {

    await page.goto( `/triage` )
    await add( page, `Gym` )
    await page.getByRole( `button`, { name: `Gym`, exact: true } ).click()

    const detail = page.getByRole( `dialog`, { name: /Task: Gym/ } )
    const title = detail.getByLabel( `Title` )
    await title.fill( `Gym every mon at 09 !2` )
    await expect( detail.locator( `mark` ) ).toHaveText( [ `every mon`, `at 09`, `!2` ] )
    await title.press( `Enter` )

    await expect( title ).toHaveValue( `Gym` )
    await expect( detail.getByLabel( `Time`, { exact: true } ) ).toHaveValue( `09:00` )
    await expect( detail.getByLabel( `Priority` ) ).toHaveValue( `2` )
    await expect( detail.getByLabel( `Repeats` ) ).toHaveValue( /mon/ )
    const scheduled = await detail.getByLabel( `Scheduled` ).inputValue()
    expect( new Date( `${ scheduled }T12:00` ).getDay() ).toBe( 1 )

    // Unknown names are never created silently: they stay in the title, and don't cost the time next to them
    await title.fill( `Gym at 5 #Nowhere` )
    await title.press( `Enter` )
    await expect( title ).toHaveValue( `Gym #Nowhere` )
    await expect( detail.getByLabel( `Time`, { exact: true } ) ).toHaveValue( `17:00` )
} )

test( `quoted text stays protected through later title edits`, async ( { page } ) => {

    await page.goto( `/triage` )
    await add( page, `Read "by friday" book` )
    await page.getByRole( `button`, { name: `Read by friday book`, exact: true } ).click()

    const detail = page.getByRole( `dialog`, { name: /Task: Read by friday book/ } )
    const title = detail.getByLabel( `Title` )
    await title.fill( `Read by friday book again` )
    await expect( detail.locator( `mark` ) ).toHaveCount( 0 )
    await title.press( `Enter` )
    await expect( title ).toHaveValue( `Read by friday book again` )
    await expect( detail.getByLabel( `Deadline`, { exact: true } ) ).toHaveValue( `` )
} )
