import { browserSupportsWebAuthn, startAuthentication, startRegistration, WebAuthnError } from '@simplewebauthn/browser'
import { announce_account_change, api, begin_sync, device_label } from './sync'

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
 * Mails a sign-in link + code. While signed in, it confirms an email for this account instead.
 * @param {string} email
 * @returns {Promise<{ sent_to: string }>}
 */
export const send_email_link = email => api( `/api/email-link`, { method: `POST`, body: { email } } )

/**
 * Uses an email link: its token (from the URL), or the email + typed code.
 * @param {{ token?: string, email?: string, code?: string }} proof
 * @returns {Promise<{ session_id?: string, created?: boolean, added?: boolean }>}
 */
export const email_sign_in = async proof => {
    const result = await api( `/api/login/email`, { method: `POST`, body: { ...proof, label: device_label() } } )
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
    return signed_in( await api( `/api/passkey/login`, { method: `POST`, body: { response, label: device_label() } } ) )
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
    const result = await api( `/api/passkey/register`, { method: `POST`, body: { response, label: device_label() } } )
    return for_new_account ? signed_in( result ) : result
}
