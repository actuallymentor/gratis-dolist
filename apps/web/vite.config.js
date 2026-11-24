import { execSync } from 'node:child_process'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// Short commit hash shown in Settings, so "which build am I on?" never needs devtools
const build_hash = ( () => {
    try {
        return execSync( `git rev-parse --short HEAD` ).toString().trim()
    } catch {
        return `dev`
    }
} )()

export default defineConfig( {
    define: { __BUILD_HASH__: JSON.stringify( build_hash ) },
    plugins: [
        react(),
        VitePWA( {

            // We decide when to activate: instantly when nothing is unsaved, else via the badge
            registerType: `prompt`,
            includeAssets: [ `favicon.svg`, `robots.txt` ],
            manifest: {
                name: `Dolist`,
                short_name: `Dolist`,
                description: `Calm, fast task capture and planning`,
                start_url: `/`,
                display: `standalone`,
                background_color: `#fafbfc`,
                theme_color: `#376675`,
                icons: [
                    { src: `logo192.png`, sizes: `192x192`, type: `image/png` },
                    { src: `logo512.png`, sizes: `512x512`, type: `image/png` },
                    { src: `logo512.png`, sizes: `512x512`, type: `image/png`, purpose: `maskable` },
                ],
            },
            workbox: {
                navigateFallback: `/index.html`,

                // The sync + API endpoints must always hit the network (plan §4)
                navigateFallbackDenylist: [ /^\/api/, /^\/sync/ ],
                globPatterns: [ `**/*.{js,css,html,svg,png,woff2}` ],
            },
        } ),
    ],
} )
