import { expect } from '@playwright/test'
import { SKIP_WELCOME } from './welcome.js'

// Shared e2e helpers for signed-in flows. Each test is its own deployment: the E2E-only `dolist_tenant`
// cookie picks an isolated Auth DO, and mail lands in its outbox (GET /api/e2e/outbox) instead of being sent.

export const status = page => page.getByLabel( `Sync status` )
export const tenant = () => crypto.randomUUID()
export const new_email = () => `${ crypto.randomUUID().slice( 0, 8 ) }@example.com`

// Browsers of this test. Each spec closes them in afterEach (`close_devices`; a hook here would register
// only for the first file a worker loads): open sockets pile up otherwise, and WebKit's per-host
// connection pool runs dry (later requests just queue)
const opened = []
export const close_devices = () => Promise.all( opened.splice( 0 ).map( context => context.close() ) )

/**
 * A fresh browser (context) of the given tenant.
 * @returns {Promise<{ context, page }>}
 */
export const device = async ( browser, id ) => {
    const context = await browser.newContext( { storageState: SKIP_WELCOME } )
    opened.push( context )
    await context.addCookies( [ { name: `dolist_tenant`, value: id, url: `http://localhost:8787` } ] )
    return { context, page: await context.newPage() }
}

/**
 * The last link + code mailed to an address.
 * @returns {Promise<{ link: string, code: string }>}
 */
export const mail = async ( page, email ) => {
    const response = await page.request.get( `/api/e2e/outbox?email=${ encodeURIComponent( email ) }` )
    return response.json()
}

/**
 * Asks for an email link on /signin.
 */
export const request_link = async ( page, email ) => {
    await page.goto( `/signin` )
    await page.getByLabel( `Email`, { exact: true } ).fill( email )
    await page.getByRole( `button`, { name: `Email me a link` } ).click()
    await expect( page.getByText( `Sent to ${ email }` ) ).toBeVisible()
}

// After an email sign-in the app offers a passkey once (where WebAuthn exists): decline, land in Settings
const skip_passkey_offer = async page => {
    const not_now = page.getByRole( `button`, { name: `Not now` } )
    await expect( not_now.or( status( page ) ) ).toBeVisible()
    if( await not_now.isVisible() ) await not_now.click()
    await expect( status( page ) ).toHaveText( `Synced` )
}

/**
 * Signs in (or up) by opening the emailed link, as a person would.
 */
export const sign_in_by_link = async ( page, email ) => {
    await request_link( page, email )
    const { link } = await mail( page, email )
    await page.goto( link )
    await skip_passkey_offer( page )
}

/**
 * Signs in by typing the emailed code (the installed app, which the link can't open).
 */
export const sign_in_by_code = async ( page, email ) => {
    await request_link( page, email )
    const { code } = await mail( page, email )
    await page.getByLabel( `Code from the email` ).fill( code.toLowerCase() )
    await page.getByRole( `button`, { name: `Sign in`, exact: true } ).click()
    await skip_passkey_offer( page )
}

/**
 * A software passkey authenticator for this page (Chromium only, via CDP).
 * @returns {Promise<{ cdp, id: string }>}
 */
export const authenticator = async page => {
    const cdp = await page.context().newCDPSession( page )
    await cdp.send( `WebAuthn.enable` )
    const { authenticatorId: id } = await cdp.send( `WebAuthn.addVirtualAuthenticator`, { options: {
        protocol: `ctap2`, transport: `internal`, hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true,
    } } )
    return { cdp, id }
}
