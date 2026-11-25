import { defineConfig, devices } from '@playwright/test'

export const ENROLLMENT_CODE = `e2e-enroll-code`

// E2E runs against the real Worker (wrangler dev serving apps/web/dist), as prod does
export default defineConfig( {
    testDir: `e2e`,
    fullyParallel: true,
    reporter: process.env.CI ? `github` : `list`,
    use: { baseURL: `http://localhost:8787`, trace: `retain-on-failure` },
    projects: [
        { name: `desktop`, use: { ...devices[ `Desktop Chrome` ] } },
        { name: `phone`, use: { ...devices[ `Pixel 7` ] } },
        { name: `iphone`, use: { ...devices[ `iPhone 15` ] } },
    ],
    webServer: {
        // Fresh server state per run; E2E enables per-test tenants (dolist_tenant cookie), never set in prod
        command: `rm -rf .wrangler/e2e && CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV=false npx wrangler dev --port 8787 --ip 127.0.0.1 --persist-to .wrangler/e2e --var ENROLLMENT_CODE:${ ENROLLMENT_CODE } --var E2E:1`,
        url: `http://localhost:8787`,
        reuseExistingServer: false,
        timeout: 60_000,
    },
} )
