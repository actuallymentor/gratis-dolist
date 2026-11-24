/* global __BUILD_HASH__ */
// Injected by vite.config.js at build time
export const build_hash = typeof __BUILD_HASH__ === `string` ? __BUILD_HASH__ : `dev`
