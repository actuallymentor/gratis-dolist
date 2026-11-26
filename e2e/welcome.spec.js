import { expect, test } from '@playwright/test'
import { close_devices, device, new_email, sign_in_by_link, tenant } from './account.js'

// The sign-in welcome screen: once per page load while signed out. These tests start without the skip flag.

test.use( { storageState: { cookies: [], origins: [] } } )
test.afterEach( close_devices )

const welcome = page => page.getByRole( `dialog`, { name: `Welcome to Dolist` } )

test( `signed out: shows on load, continue dismisses until the next load`, async ( { page } ) => {

    await page.goto( `/today` )
    await expect( welcome( page ) ).toBeVisible()
    await page.getByRole( `button`, { name: `Continue without login` } ).click()
    await expect( welcome( page ) ).toHaveCount( 0 )

    // In-app navigation keeps it away; the app works locally
    await page.getByRole( `navigation`, { name: `Main` } ).getByRole( `link`, { name: `Inbox` } ).click()
    await expect( page.getByRole( `heading`, { name: `Inbox` } ) ).toBeVisible()
    await expect( welcome( page ) ).toHaveCount( 0 )

    // A new page load asks again
    await page.reload()
    await expect( welcome( page ) ).toBeVisible()
} )

test( `the covered app takes no keys`, async ( { page } ) => {

    await page.goto( `/inbox` )
    await expect( welcome( page ) ).toBeVisible()
    await page.keyboard.type( `ghosttask` ) // no space: that would press the focused Sign in button
    for( const key of [ `Tab`, `Tab`, `Tab`, `Shift+Tab`, `Shift+Tab`, `Shift+Tab` ] ) {
        await page.keyboard.press( key )
        expect( await page.evaluate( () => !!document.activeElement?.closest( `#root` ) ) ).toBe( false )
    }

    await page.getByRole( `button`, { name: `Continue without login` } ).click()
    await expect( page.getByRole( `textbox`, { name: `New task` } ) ).toHaveValue( `` )
} )

test( `a load that starts on capture stays uninterrupted`, async ( { page } ) => {

    await page.goto( `/capture` )
    await expect( page.getByRole( `textbox`, { name: `New task` } ) ).toBeVisible()
    await page.goto( `/capture` )
    await page.evaluate( () => history.pushState( {}, ``, `/inbox` ) || dispatchEvent( new PopStateEvent( `popstate` ) ) )
    await expect( page.getByRole( `heading`, { name: `Inbox` } ) ).toBeVisible()
    await expect( welcome( page ) ).toHaveCount( 0 )
} )

test( `sign in goes to the sign-in page`, async ( { page } ) => {

    await page.goto( `/inbox` )
    await page.getByRole( `button`, { name: `Sign in or create account` } ).click()
    await expect( page ).toHaveURL( /\/signin/ )
    await expect( welcome( page ) ).toHaveCount( 0 )
} )

test( `never covers sign-in or capture`, async ( { page } ) => {

    await page.goto( `/signin` )
    await expect( page.getByRole( `heading`, { name: /Sign in/ } ) ).toBeVisible()
    await expect( welcome( page ) ).toHaveCount( 0 )

    await page.goto( `/capture` )
    await expect( page.getByRole( `textbox`, { name: `New task` } ) ).toBeVisible()
    await expect( welcome( page ) ).toHaveCount( 0 )
} )

test( `signed in: never shows, not even as a flash`, async ( { browser } ) => {

    const { page } = await device( browser, tenant() )
    await sign_in_by_link( page, new_email() )
    await page.evaluate( () => localStorage.removeItem( `dolist:skip-welcome` ) )

    // Watch from the first byte of the next load, so even a one-frame flash counts
    await page.addInitScript( () => {
        new MutationObserver( () => {
            if( document.querySelector( `[aria-label="Welcome to Dolist"]` ) ) window.welcome_seen = true
        } ).observe( document, { childList: true, subtree: true } )
    } )
    await page.goto( `/today` )
    await expect( page.getByRole( `heading`, { name: `Today` } ) ).toBeVisible()
    await page.waitForTimeout( 1_000 )
    expect( await page.evaluate( () => !!window.welcome_seen ) ).toBe( false )

    // Signing out mid-session doesn't pop it either; only the next load asks
    await page.goto( `/settings` )
    await page.getByRole( `button`, { name: /Sign out/ } ).click()
    await expect( page.getByRole( `link`, { name: `Sign in` } ).first() ).toBeVisible()
    expect( await welcome( page ).count() ).toBe( 0 )
} )
