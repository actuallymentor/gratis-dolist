import { defineConfig, devices } from '@playwright/test'

// E2E runs against the real Worker (wrangler dev serving apps/web/dist), as prod does
export default defineConfig( {
    testDir: `e2e`,
    fullyParallel: true,
    reporter: process.env.CI ? `github` : `list`,
    use: { baseURL: `http://localhost:8787`, trace: `retain-on-failure` },
    projects: [
        { name: `desktop`, use: { ...devices[ `Desktop Chrome` ] } },
        { name: `phone`, use: { ...devices[ `Pixel 7` ] } },
    ],
    webServer: {
        command: `npx wrangler dev --port 8787 --ip 127.0.0.1`,
        url: `http://localhost:8787`,
        reuseExistingServer: !process.env.CI,
        timeout: 60_000,
    },
} )
