import { expect, test } from '@playwright/test'

test( `opens on Horizons and navigates every section; old links redirect`, async ( { page } ) => {

    await page.goto( `/` )
    await expect( page ).toHaveURL( /\/horizons$/ )
    await expect( page.getByRole( `heading`, { name: `Horizons` } ) ).toBeVisible()
    await page.goto( `/horizons` )
    await expect( page ).toHaveURL( /\/horizons$/ )
    await page.goto( `/inbox?task=nope` )
    await expect( page ).toHaveURL( /\/triage\?task=nope$/ )

    const nav = page.getByRole( `navigation`, { name: `Main` } )
    await expect( nav.getByRole( `link`, { name: `Today` } ) ).toHaveCount( 0 )
    for( const [ link, heading ] of [ [ `Triage`, `Triage` ], [ `Horizons`, `Horizons` ], [ `Projects`, `Projects` ], [ `Settings`, `Settings` ] ] ) {
        await nav.getByRole( `link`, { name: link } ).click()
        await expect( page.getByRole( `heading`, { name: heading, level: 1 } ) ).toBeVisible()
    }

} )

test( `Horizons shows the four rolling lanes plus Someday`, async ( { page } ) => {
    await page.goto( `/horizons` )
    for( const lane of [ `Today`, `This week`, `This month`, `This quarter`, `Someday` ] ) {
        await expect( page.getByRole( `region`, { name: lane } ) ).toBeVisible()
    }
} )

test( `deep links survive a reload (SPA fallback)`, async ( { page } ) => {
    await page.goto( `/triage` )
    await page.reload()
    await expect( page.getByRole( `heading`, { name: `Triage` } ) ).toBeVisible()
} )

test( `theme choice applies and persists; build hash shows`, async ( { page } ) => {

    await page.goto( `/settings` )
    await page.getByLabel( `Theme` ).selectOption( `dark` )
    await expect( page.locator( `html` ) ).toHaveAttribute( `data-theme`, `dark` )

    await page.reload()
    await expect( page.locator( `html` ) ).toHaveAttribute( `data-theme`, `dark` )
    await expect( page.getByText( /^Build / ) ).toContainText( /[0-9a-f]{7}|dev/ )

} )

test( `works offline after first visit`, async ( { page, context } ) => {

    await page.goto( `/horizons` )
    await page.evaluate( () => navigator.serviceWorker.ready )

    // Reload once so the service worker controls the page, then cut the network
    await page.reload()
    await context.setOffline( true )
    await page.goto( `/horizons` )
    await expect( page.getByRole( `heading`, { name: `Horizons` } ) ).toBeVisible()
    await context.setOffline( false )

} )

test( `"Update app" offline keeps the working app`, async ( { page, context } ) => {

    await page.goto( `/settings` )
    await page.evaluate( () => navigator.serviceWorker.ready )
    await page.reload()

    await context.setOffline( true )
    await page.getByRole( `button`, { name: `Update` } ).click()
    await expect( page.getByRole( `status` ).filter( { hasText: `Try again once` } ) ).toBeVisible()

    // Cached shell still loads
    await page.goto( `/triage` )
    await expect( page.getByRole( `heading`, { name: `Triage` } ) ).toBeVisible()
    await context.setOffline( false )

} )

test( `install pill never covers navigation`, async ( { page } ) => {
    await page.goto( `/horizons` )
    const settings = page.getByRole( `navigation`, { name: `Main` } ).getByRole( `link`, { name: `Settings` } )
    await settings.click( { trial: true } )
} )
