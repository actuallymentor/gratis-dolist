import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parse_quick_add } from '../src/index.js'

// Corpus gate (plan §2.5): real Todoist titles must survive the parser. Private file; skipped in CI.
// Never print titles: failures report counts and row indexes only.
const corpus_path = new URL( `../../../fixtures/private/corpus.json`, import.meta.url )
const export_path = new URL( `../../../fixtures/private/todoist-export.json`, import.meta.url )

const PROTECTED_RX = /\[[^\]\n]*\]\([^)\s]*\)|\b[a-z][a-z0-9+.-]*:\/\/\S+|[\w.+-]+@[\w-]+(?:\.[\w-]+)+/gi

// skipIf still runs this callback at collection: read the fixture only when it exists
const has_corpus = existsSync( corpus_path )

describe.skipIf( !has_corpus )( `corpus: zero title corruption`, () => {

    const rows = has_corpus ? JSON.parse( readFileSync( corpus_path, `utf8` ) ) : []
    const account = existsSync( export_path ) ? JSON.parse( readFileSync( export_path, `utf8` ) ) : { projects: [], labels: [] }
    const options = { today: `2026-11-24`, projects: account.projects.map( ( { name } ) => name ), labels: account.labels.map( ( { name } ) => name ) }
    const results = rows.map( ( { content }, index ) => ( { index, content, ...parse_quick_add( content, options ) } ) )

    it( `titles without grammar come back byte-for-byte`, () => {
        const corrupted = results.filter( ( { spans, task, content } ) => !spans.length && task.title !== content.trim() ).map( ( { index } ) => index )
        expect( corrupted ).toEqual( [] )
    } )

    it( `URLs, markdown links and emails always survive verbatim`, () => {
        const broken = results
            .filter( ( { content, task } ) => ( content.match( PROTECTED_RX ) || [] ).some( piece => !task.title.includes( piece ) ) )
            .map( ( { index } ) => index )
        expect( broken ).toEqual( [] )
    } )

    it( `no priority, time, recurrence, field or unknown-name false positives`, () => {
        const risky = results.filter( ( { spans } ) => spans.some( span => [ `priority`, `time`, `recur`, `field` ].includes( span.type ) || span.unknown ) )
        expect( risky.map( ( { index } ) => index ) ).toEqual( [] )
    } )

    it( `date words in stored titles stay under 1% (Todoist already stripped real ones)`, () => {
        const dated = results.filter( ( { spans } ) => spans.length )
        expect( dated.length / rows.length ).toBeLessThan( 0.01 )
    } )

} )
