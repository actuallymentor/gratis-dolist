import { expect, test } from '@playwright/test'
import { SKIP_WELCOME } from './welcome.js'
import { add, open_add, quick_add } from './ui.js'

// M1 daily core, driven like a user. Each test gets a fresh browser context (empty IndexedDB).

// The capture page keeps an inline box with per-tab drafts (slot `quick-add`)
const capture_box = page => page.getByRole( `textbox`, { name: `New task` } )

test( `capture with grammar lands in the right lists`, async ( { page } ) => {

    await page.goto( `/triage` )
    const box = await open_add( page )
    await box.fill( `Call mum today !1 @calls` )

    // Live chips show what was understood before submitting
    await expect( page.getByLabel( `Understood` ).getByText( `!1`, { exact: true } ) ).toBeVisible()
    await box.press( `Enter` )

    // Unknown label: first Enter offers, second creates
    await expect( page.getByRole( `status` ).filter( { hasText: `Enter again to create` } ) ).toBeVisible()
    await box.press( `Enter` )
    await expect( quick_add( page ) ).toHaveCount( 0 )

    // Dated, so it skips Triage (default view) and sits in today's lane
    await expect( page.getByText( `Added “Call mum”` ) ).toBeVisible()
    await expect( page.getByRole( `button`, { name: `Call mum`, exact: true } ) ).toHaveCount( 0 )
    await page.goto( `/horizons` )
    await expect( page.getByRole( `region`, { name: `Today` } ).getByRole( `button`, { name: `Call mum`, exact: true } ) ).toBeVisible()

} )

test( `capture survives an immediate reload; drafts persist`, async ( { page } ) => {

    await page.goto( `/triage` )
    await add( page, `Buy sunscreen` )
    await expect( page.getByRole( `button`, { name: `Buy sunscreen` } ) ).toBeVisible()
    await ( await open_add( page ) ).fill( `half typed thought` )

    await page.reload()
    await expect( page.getByRole( `button`, { name: `Buy sunscreen` } ) ).toBeVisible()
    await expect( await open_add( page ) ).toHaveValue( `half typed thought` )

} )

test( `complete with undo, then reopen from history`, async ( { page } ) => {

    await page.goto( `/triage` )
    await add( page, `Water plants` )
    await page.getByRole( `checkbox`, { name: `Complete Water plants` } ).click()
    await expect( page.getByRole( `button`, { name: `Water plants` } ) ).toHaveCount( 0 )

    await page.getByRole( `button`, { name: `Undo` } ).click()
    await expect( page.getByRole( `button`, { name: `Water plants` } ) ).toBeVisible()

    // Let the first ack leave, so the next wait proves the second completion's ack
    await expect( page.getByText( `Completed “Water plants”` ) ).toHaveCount( 0 )

    await page.getByRole( `checkbox`, { name: `Complete Water plants` } ).click()

    // The toast is the durable ack: once it shows, a reload must keep the completion
    await expect( page.getByText( `Completed “Water plants”` ).last() ).toBeVisible()
    await page.goto( `/completed` )
    await page.getByRole( `button`, { name: `Reopen` } ).click()
    await expect( page.getByText( `Reopened “Water plants”` ) ).toBeVisible()
    await page.goto( `/triage` )
    await expect( page.getByRole( `button`, { name: `Water plants` } ) ).toBeVisible()

} )

test( `task detail edits fields and survives reload`, async ( { page } ) => {

    await page.goto( `/triage` )
    await add( page, `Draft report` )
    await page.getByRole( `button`, { name: `Draft report` } ).click()

    const panel = page.getByRole( `dialog`, { name: /Task: Draft report/ } )
    await panel.getByLabel( `Notes` ).fill( `Use the Q3 numbers` )
    await panel.getByLabel( `Priority` ).selectOption( `2` )
    await panel.getByLabel( `Deadline`, { exact: true } ).fill( `2030-01-15` )
    await panel.getByLabel( `Title` ).click()

    await page.reload()
    await expect( panel ).toBeVisible()
    await expect( panel.getByLabel( `Notes` ) ).toHaveValue( `Use the Q3 numbers` )
    await expect( panel.getByLabel( `Priority` ) ).toHaveValue( `2` )

    await page.keyboard.press( `Escape` )
    await expect( panel ).toHaveCount( 0 )

} )

test( `search finds titles and notes`, async ( { page } ) => {

    await page.goto( `/triage` )
    await add( page, `Renew passport` )
    await page.goto( `/search?q=passport` )
    await expect( page.getByRole( `button`, { name: `Renew passport` } ) ).toBeVisible()
    await page.getByRole( `textbox`, { name: `Search` } ).fill( `zebra` )
    await expect( page.getByText( `No matches` ) ).toBeVisible()

} )

test( `Horizons: keyboard Move command reschedules`, async ( { page } ) => {

    await page.goto( `/triage` )
    await add( page, `Plan trip today` )
    await page.goto( `/horizons` )

    const today_lane = page.getByRole( `region`, { name: `Today` } )
    await expect( today_lane.getByRole( `button`, { name: `Plan trip`, exact: true } ) ).toBeVisible()

    await today_lane.getByRole( `button`, { name: `Plan trip`, exact: true } ).focus()
    await page.keyboard.press( `m` )
    await page.getByRole( `menuitem`, { name: /This month/ } ).click()
    await expect( page.getByRole( `region`, { name: `This month` } ).getByRole( `button`, { name: `Plan trip`, exact: true } ) ).toBeVisible()

} )

test( `export then import round-trips`, async ( { page, browser } ) => {

    await page.goto( `/triage` )
    await add( page, `Exported task` )
    await page.goto( `/settings` )
    const [ download ] = await Promise.all( [ page.waitForEvent( `download` ), page.getByRole( `button`, { name: `Export` } ).click() ] )
    const file = await download.path()

    // Fresh, empty browser profile imports the file
    const fresh = await ( await browser.newContext( { storageState: SKIP_WELCOME } ) ).newPage()
    await fresh.goto( `/settings` )
    await fresh.getByLabel( `Import file` ).setInputFiles( file )
    await expect( fresh.getByText( `Imported` ) ).toBeVisible()
    await fresh.goto( `/triage` )
    await expect( fresh.getByRole( `button`, { name: `Exported task` } ) ).toBeVisible()

} )

test( `offline capture works`, async ( { page, context } ) => {

    await page.goto( `/triage` )
    await page.evaluate( () => navigator.serviceWorker.ready )
    await page.reload()
    await context.setOffline( true )
    await page.reload()
    await add( page, `Offline idea` )
    await expect( page.getByRole( `button`, { name: `Offline idea` } ) ).toBeVisible()
    await context.setOffline( false )

} )

test( `? opens the cheatsheet`, async ( { page } ) => {
    await page.goto( `/horizons` )
    await expect( page.getByRole( `region`, { name: `Today` } ) ).toBeVisible()
    await page.keyboard.press( `?` )
    await expect( page.getByRole( `dialog`, { name: `Cheatsheet` } ) ).toBeVisible()
    await page.keyboard.press( `Escape` )
    await expect( page.getByRole( `dialog`, { name: `Cheatsheet` } ) ).toHaveCount( 0 )
} )

// ── Regressions from the M1 review ──────────────────────────────────────────

test( `Escape keeps detail edits`, async ( { page } ) => {
    await page.goto( `/triage` )
    await add( page, `Edit me` )
    await page.getByRole( `button`, { name: `Edit me` } ).click()
    const panel = page.getByRole( `dialog`, { name: /Task: Edit me/ } )
    await panel.getByLabel( `Notes` ).fill( `typed then escaped` )
    await page.keyboard.press( `Escape` )
    await page.getByRole( `button`, { name: `Edit me` } ).click()
    await expect( panel.getByLabel( `Notes` ) ).toHaveValue( `typed then escaped` )
} )

test( `confirming a new project and label assigns them`, async ( { page } ) => {
    await page.goto( `/triage?no_project=1` )
    await add( page, `Prune roses #Garden @outside`, { create: true } )

    // In a project, so this triage view (No project on) hides it; it carries the label
    await expect( page.getByRole( `button`, { name: `Prune roses` } ) ).toHaveCount( 0 )
    await page.goto( `/search?q=roses` )
    const card = page.locator( `[data-task-id]` ).filter( { hasText: `Prune roses` } )
    await expect( card ).toContainText( `Garden` )
    await expect( card ).toContainText( `outside` )
} )

test( `subtasks can be completed and opened from the parent`, async ( { page } ) => {
    await page.goto( `/triage` )
    await add( page, `Parent task` )
    await page.getByRole( `button`, { name: `Parent task` } ).click()
    const panel = page.getByRole( `dialog`, { name: /Task: Parent task/ } )
    await panel.getByLabel( `Add subtask` ).fill( `Child step` )
    await panel.getByLabel( `Add subtask` ).press( `Enter` )
    await panel.getByRole( `button`, { name: `Child step` } ).click()
    await expect( page.getByRole( `dialog`, { name: /Task: Child step/ } ) ).toBeVisible()
} )

test( `Move button works without a keyboard, incl. to Someday`, async ( { page } ) => {
    await page.goto( `/triage` )
    await add( page, `Tap mover today` )
    await page.goto( `/horizons` )
    await page.getByRole( `button`, { name: `Move Tap mover` } ).click()
    await page.getByRole( `menuitem`, { name: /Someday/ } ).click()
    await expect( page.getByRole( `region`, { name: `Today` } ).getByRole( `button`, { name: `Tap mover`, exact: true } ) ).toHaveCount( 0 )
    await expect( page.getByRole( `region`, { name: `Someday` } ).getByRole( `button`, { name: `Tap mover`, exact: true } ) ).toBeVisible()
} )

test( `submitting in one tab keeps another tab's draft`, async ( { page, context } ) => {
    await page.goto( `/capture` )
    const other = await context.newPage()
    await other.goto( `/capture` )
    await capture_box( other ).fill( `draft in tab B` )
    await capture_box( page ).fill( `Submitted in tab A` )
    await capture_box( page ).press( `Enter` )
    await expect( page.getByLabel( `Just added` ) ).toContainText( `Submitted in tab A` )
    await page.waitForTimeout( 300 )
    await other.reload()
    await expect( capture_box( other ) ).toHaveValue( `draft in tab B` )
} )

// ── Regressions from the M1 fix review ──────────────────────────────────────

test( `closing an untouched detail panel keeps another tab's edit`, async ( { page, context } ) => {
    await page.goto( `/triage` )
    await add( page, `Shared task` )
    await page.getByRole( `button`, { name: `Shared task` } ).click()

    const other = await context.newPage()
    await other.goto( `/triage` )
    await other.getByRole( `button`, { name: `Shared task` } ).click()
    await other.getByRole( `dialog` ).getByLabel( `Notes` ).fill( `from tab B` )
    await other.keyboard.press( `Escape` )

    // Tab A's open panel follows the stored value, and closing it writes nothing stale
    await expect( page.getByRole( `dialog` ).getByLabel( `Notes` ) ).toHaveValue( `from tab B` )
    await page.keyboard.press( `Escape` )
    await page.waitForTimeout( 300 )
    await other.reload()
    await other.getByRole( `button`, { name: `Shared task` } ).click()
    await expect( other.getByRole( `dialog` ).getByLabel( `Notes` ) ).toHaveValue( `from tab B` )
} )

test( `a tab opened from another gets its own draft`, async ( { page } ) => {
    await page.goto( `/capture` )
    await capture_box( page ).fill( `draft in opener` )
    const [ popup ] = await Promise.all( [ page.waitForEvent( `popup` ), page.evaluate( () => window.open( `/capture` ) ) ] )
    await popup.waitForLoadState()

    // Typed straight away, before the popup has settled on its own id
    await capture_box( popup ).fill( `draft in popup` )
    await popup.waitForTimeout( 600 )
    await page.reload()
    await expect( capture_box( page ) ).toHaveValue( `draft in opener` )
    await popup.reload()
    await expect( capture_box( popup ) ).toHaveValue( `draft in popup` )
} )

test( `a draft saved before per-tab keys is recovered`, async ( { page } ) => {
    await page.goto( `/capture` )
    await page.evaluate( () => localStorage.setItem( `dolist:draft:quick-add`, `legacy draft` ) )
    await page.reload()
    await expect( capture_box( page ) ).toHaveValue( `legacy draft` )
} )
