// Storage state that starts a browser past the sign-in welcome screen (the app reads this flag once per load)
export const SKIP_WELCOME = {
    cookies: [],
    origins: [ { origin: `http://localhost:8787`, localStorage: [ { name: `dolist:skip-welcome`, value: `1` } ] } ],
}
