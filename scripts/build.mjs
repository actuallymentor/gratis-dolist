// Build the static site served by the `dolist` Worker.
//
// For now the site *is* the design prototype. The prototype is authored as an
// artifact body (no <!doctype>/<head>), so wrap it in a minimal document here
// instead of keeping two copies in sync.

import { mkdir, readFile, writeFile } from "node:fs/promises"

const SRC  = "design/prototype.html"
const OUT  = "dist"

const body = await readFile( SRC, "utf8" )

const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<style>*,*::before,*::after{box-sizing:border-box}body{margin:0}[hidden]{display:none!important}</style>
</head>
<body>
${ body }
</body>
</html>
`

await mkdir( OUT, { recursive: true } )
await writeFile( `${ OUT }/index.html`, page )

console.log( `Built ${ OUT }/index.html from ${ SRC }` )
