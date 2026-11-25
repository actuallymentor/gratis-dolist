import { browserSupportsWebAuthn, startAuthentication, startRegistration, WebAuthnError } from '@simplewebauthn/browser'
import { announce_account_change, api, begin_sync, device_label, refresh_account } from './sync'
import { use_app_store } from '../stores/app'

/**
 * Sign-in and account actions (plan §4.1): email link (+ code for installed apps), passkeys.
 * Every sign-in ends in `signed_in()`: start sync here, tell the other tabs.
 */

export const passkeys_supported = () => browserSupportsWebAuthn()

const signed_in = async result => {
    await begin_sync()
    announce_account_change()
    return result
}

/**
 * A sign-in call whose reply can be lost after the server already signed us in (the link or code is
 * used up by then): on failure, ask the server whether a new session exists and carry on with it.
 */
const sign_in_call = async ( path, body ) => {
    const before = use_app_store.getState().account?.session_id ?? null
    try {
        return await api( path, { method: `POST`, body: { ...body, label: device_label() } } )
    } catch ( error ) {

        // The server answered (wrong code, throttled, …): that's final. Only a lost reply is ambiguous
        if( error.status ) throw error
        const account = await refresh_account()
        if( account?.signed_in && account.session_id !== before ) return { session_id: account.session_id }
        throw error
    }
}

// Email links asked for in this browser, so a link someone else sent can be told apart (see SignInPage)
const REQUEST_KEY = `dolist:email-request`
const LINK_TTL = 15 * 60_000
export const requested_link_here = () => {
    try {
        return Date.now() - Number( localStorage.getItem( REQUEST_KEY ) ) < LINK_TTL
    } catch {
        return false
    }
}

/**
 * Mails a sign-in link + code. While signed in, it confirms an email for this account instead.
 * @param {string} email
 * @returns {Promise<{ sent_to: string }>}
 */
export const send_email_link = async email => {
    const result = await api( `/api/email-link`, { method: `POST`, body: { email } } )
    try {
        localStorage.setItem( REQUEST_KEY, String( Date.now() ) )
    } catch { /* private mode: the link then asks before signing in */ }
    return result
}

/**
 * Uses an email link: its token (from the URL), or the email + typed code.
 * @param {{ token?: string, email?: string, code?: string }} proof
 * @returns {Promise<{ session_id?: string, created?: boolean, added?: boolean }>}
 */
export const email_sign_in = async proof => {
    const result = await sign_in_call( `/api/login/email`, proof )
    return result.added ? result : signed_in( result )
}

// The user closing the browser's passkey sheet isn't an error worth a toast
const cancelled = error => error?.name === `NotAllowedError` || error instanceof WebAuthnError && error.code === `ERROR_CEREMONY_ABORTED`

/**
 * Signs in with any passkey saved for this site.
 * @returns {Promise<Object|null>} null when the user cancelled
 */
export const passkey_sign_in = async () => {
    const options = await api( `/api/passkey/login/options`, { method: `POST` } )
    let response
    try {
        response = await startAuthentication( { optionsJSON: options } )
    } catch ( error ) {
        if( cancelled( error ) ) return null
        throw error
    }
    return signed_in( await sign_in_call( `/api/passkey/login`, { response } ) )
}

/**
 * Creates a passkey: signed out, a new account; signed in, another way into this one.
 * @param {boolean} for_new_account
 * @returns {Promise<Object|null>} null when the user cancelled
 */
export const create_passkey = async for_new_account => {
    const options = await api( `/api/passkey/register/options`, { method: `POST` } )
    let response
    try {
        response = await startRegistration( { optionsJSON: options } )
    } catch ( error ) {
        if( cancelled( error ) ) return null
        throw error
    }
    if( !for_new_account ) return api( `/api/passkey/register`, { method: `POST`, body: { response, label: device_label() } } )
    return signed_in( await sign_in_call( `/api/passkey/register`, { response } ) )
}
