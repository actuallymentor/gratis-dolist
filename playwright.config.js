import { defineConfig, devices } from '@playwright/test'
import { SKIP_WELCOME } from './e2e/welcome.js'


// E2E runs against the real Worker (wrangler dev serving apps/web/dist), as prod does
export default defineConfig( {
    testDir: `e2e`,
    fullyParallel: true,

    // Local: half of a big box's cores (16+) starves WebKit into timeouts; CI keeps the default
    workers: process.env.CI ? undefined : 8,
    reporter: process.env.CI ? `github` : `list`,
    // Every test starts past the sign-in welcome screen; e2e/welcome.spec.js opts back in
    use: { baseURL: `http://localhost:8787`, trace: `retain-on-failure`, storageState: SKIP_WELCOME },
    projects: [
        { name: `desktop`, use: { ...devices[ `Desktop Chrome` ] }, testIgnore: /heavy\.spec/ },
        { name: `phone`, use: { ...devices[ `Pixel 7` ] }, testIgnore: /heavy\.spec/ },
        // One retry: under full local parallelism a WebKit request to wrangler dev occasionally never completes
        // (~1 run in 5, never alone, never Chromium; see .notes/GOTCHAS.md). Real failures still fail twice
        { name: `iphone`, use: { ...devices[ `iPhone 15` ] }, testIgnore: /heavy\.spec/, retries: 1 },

        // Payload-size tests are browser-independent and saturate the dev server: alone, after the rest
        { name: `heavy`, use: { ...devices[ `Desktop Chrome` ] }, testMatch: /heavy\.spec/, dependencies: [ `desktop`, `phone`, `iphone` ] },
    ],
    webServer: {
        // Fresh server state per run; E2E enables per-test tenants (dolist_tenant cookie), never set in prod
        command: `rm -rf .wrangler/e2e && CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV=false npx wrangler dev --port 8787 --ip 127.0.0.1 --persist-to .wrangler/e2e --var ORIGIN:http://localhost:8787 --var E2E:1`,
        url: `http://localhost:8787`,
        reuseExistingServer: false,
        timeout: 60_000,
    },
} )
