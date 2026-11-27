import { expect, test } from '@playwright/test'
import { add } from './ui.js'

// Sidebar layout (show/hide, order, drag), Labels, rebindable shortcuts, dismissable install pill

const nav = page => page.getByRole( `navigation`, { name: `Main` } )

// Desktop: the sidebar's own row; phones: Settings → Sidebar
const open_sidebar_settings = async ( page, isMobile ) => {
    if( isMobile ) {
        await page.goto( `/settings` )
        await page.getByRole( `button`, { name: `Customize` } ).click()
    } else await nav( page ).getByRole( `button`, { name: `Sidebar settings` } ).click()
    return page.getByRole( `dialog`, { name: `Sidebar settings` } )
}

test( `sidebar settings hide, show and reorder items; the layout survives a reload`, async ( { page, isMobile } ) => {

    await page.goto( `/horizons` )
    let dialog = await open_sidebar_settings( page, isMobile )
    await dialog.getByRole( `checkbox`, { name: `Search` } ).uncheck()
    await dialog.getByRole( `button`, { name: `Move Projects up` } ).click()
    await dialog.getByRole( `button`, { name: `Done` } ).click()
    await expect( dialog ).toHaveCount( 0 )

    await page.reload()
    await expect( nav( page ).getByRole( `link`, { name: `Search` } ) ).toHaveCount( 0 )
    const order = await nav( page ).locator( `a:not(.sub)` ).allTextContents()
    expect( order.indexOf( `Projects` ) ).toBeLessThan( order.indexOf( `Horizons` ) )

    dialog = await open_sidebar_settings( page, isMobile )
    await dialog.getByRole( `button`, { name: `Reset` } ).click()
    await page.keyboard.press( `Escape` )
    await expect( nav( page ).getByRole( `link`, { name: `Search` } ) ).toBeVisible()
} )

test( `sidebar rows drag to reorder`, async ( { page, isMobile } ) => {

    test.skip( isMobile, `the phone tab bar reorders from Sidebar settings` )
    await page.goto( `/horizons` )
    const search = nav( page ).locator( `.item`, { has: page.getByRole( `link`, { name: `Search`, exact: true } ) } )
    const triage = nav( page ).locator( `.item`, { has: page.getByRole( `link`, { name: `Triage`, exact: true } ) } )
    await search.dragTo( triage, { targetPosition: { x: 20, y: 4 } } )

    const order = await nav( page ).locator( `a:not(.sub)` ).allTextContents()
    expect( order.indexOf( `Search` ) ).toBeLessThan( order.indexOf( `Triage` ) )
    await page.reload()
    const again = await nav( page ).locator( `a:not(.sub)` ).allTextContents()
    expect( again.indexOf( `Search` ) ).toBeLessThan( again.indexOf( `Triage` ) )
} )

test( `labels: listed in the sidebar, a page per label, rename, delete with Undo`, async ( { page, isMobile } ) => {

    await page.goto( `/labels` )
    await page.getByLabel( `New label name` ).fill( `calls` )
    await page.getByRole( `button`, { name: `Add label` } ).click()
    await add( page, `Ring the bank @calls` )
    await add( page, `Water plants` )

    if( !isMobile ) await expect( nav( page ).getByRole( `link`, { name: `Labels: calls` } ) ).toBeVisible()
    await page.getByRole( `link`, { name: /^@calls/ } ).click()
    await expect( page.getByRole( `heading`, { name: `@calls` } ) ).toBeVisible()
    await expect( page.getByRole( `button`, { name: `Ring the bank`, exact: true } ) ).toBeVisible()
    await expect( page.getByRole( `button`, { name: `Water plants`, exact: true } ) ).toHaveCount( 0 )

    await page.getByRole( `button`, { name: `Edit` } ).click()
    await page.getByLabel( `Label name` ).fill( `phone` )
    await page.getByRole( `button`, { name: `Save` } ).click()
    await expect( page.getByRole( `heading`, { name: `@phone` } ) ).toBeVisible()
    await expect( page.getByRole( `button`, { name: `Ring the bank`, exact: true } ) ).toBeVisible()

    await page.getByRole( `button`, { name: `Edit` } ).click()
    await page.getByRole( `button`, { name: `Delete label` } ).click()
    await expect( page ).toHaveURL( /\/labels$/ )
    await expect( page.getByRole( `link`, { name: /^@phone/ } ) ).toHaveCount( 0 )
    await page.getByRole( `button`, { name: `Undo` } ).click()
    await expect( page.getByRole( `link`, { name: /^@phone/ } ) ).toBeVisible()
} )

test( `shortcuts rebind to single keys and combinations`, async ( { page, isMobile } ) => {

    test.skip( isMobile, `keyboard shortcuts are a desktop affair` )
    await page.goto( `/settings` )

    // Add task → Shift+A; a key another action owns is refused
    const add_key = page.getByRole( `button`, { name: /^Shortcut for Add task/ } )
    await add_key.click()
    await page.keyboard.press( `j` )
    await expect( page.getByText( /already “Next task”/ ) ).toBeVisible()
    await page.keyboard.press( `Shift+A` )
    await expect( add_key ).toHaveAccessibleName( `Shortcut for Add task: Shift+A` )

    // Search → Ctrl+K (a chord: works even while typing)
    const search_key = page.getByRole( `button`, { name: /^Shortcut for Search/ } )
    await search_key.click()
    await page.keyboard.press( `Control+k` )
    await expect( search_key ).toHaveAccessibleName( `Shortcut for Search: Ctrl+K` )

    await page.goto( `/horizons` )
    await page.keyboard.press( `n` )
    await expect( page.getByRole( `dialog`, { name: `New task` } ) ).toHaveCount( 0 )
    await page.keyboard.press( `Shift+A` )
    await expect( page.getByRole( `dialog`, { name: `New task` } ) ).toBeVisible()
    await page.keyboard.press( `Escape` )
    await page.keyboard.press( `Control+k` )
    await expect( page ).toHaveURL( /\/search/ )

    // The cheatsheet shows the new keys; Reset brings the defaults back
    await page.locator( `body` ).click()
    await page.keyboard.press( `?` )
    await expect( page.getByRole( `dialog`, { name: `Cheatsheet` } ) ).toContainText( `Shift+A` )
    await page.keyboard.press( `Escape` )
    await page.goto( `/settings` )
    await page.getByRole( `button`, { name: `Reset shortcuts` } ).click()
    await expect( add_key ).toHaveAccessibleName( `Shortcut for Add task: N` )
} )

test( `the install pill dismisses for good; Settings keeps an Install row`, async ( { page } ) => {

    await page.goto( `/horizons` )
    const offer = () => page.evaluate( () => {
        const event = new Event( `beforeinstallprompt`, { cancelable: true } )
        event.prompt = async () => ( { outcome: `dismissed` } )
        window.dispatchEvent( event )
    } )
    await offer()
    const pill = page.getByRole( `group`, { name: `Install app` } )
    await expect( pill ).toBeVisible()
    await pill.getByRole( `button`, { name: `Dismiss install` } ).click()
    await expect( pill ).toHaveCount( 0 )

    await page.reload()
    await offer()
    await expect( pill ).toHaveCount( 0 )
    await page.goto( `/settings` )
    await offer()
    await expect( page.getByRole( `button`, { name: `Install`, exact: true } ) ).toBeVisible()
} )
