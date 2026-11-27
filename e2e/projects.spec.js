import { expect, test } from '@playwright/test'
import { add } from './ui.js'

// Nested projects: created from quick add (#name, #Parent/Child), listed under Projects and Horizons


test( `#Parent/Child creates nested projects; the project page and its board scope to the subtree`, async ( { page, isMobile } ) => {

    await page.goto( `/triage` )
    await add( page, `Draft proposal #Work/Clients tom`, { create: true } )
    await add( page, `Team lunch #work` )
    await add( page, `Water plants` )

    // The second task reused Work (case-insensitive); nothing new was created
    await page.goto( `/projects` )
    const work = page.getByRole( `link`, { name: /^Work/ } )
    const clients = page.getByRole( `link`, { name: /^Clients/ } )
    await expect( work ).toContainText( `2` )
    await expect( clients ).toContainText( `1` )

    // Sidebar: each project under Horizons and under Projects (desktop)
    if( !isMobile ) {
        const nav = page.getByRole( `navigation`, { name: `Main` } )
        await expect( nav.getByRole( `link`, { name: `Horizons: Work/Clients` } ) ).toBeVisible()
        await expect( nav.getByRole( `link`, { name: `Projects: Work/Clients` } ) ).toBeVisible()
    }

    // Parent page shows its own and its subprojects' tasks, not unfiled ones
    await work.click()
    await expect( page.getByRole( `heading`, { name: `Work`, exact: true } ) ).toBeVisible()
    await expect( page.getByRole( `button`, { name: `Draft proposal`, exact: true } ) ).toBeVisible()
    await expect( page.getByRole( `button`, { name: `Team lunch`, exact: true } ) ).toBeVisible()
    await expect( page.getByRole( `button`, { name: `Water plants`, exact: true } ) ).toHaveCount( 0 )

    // Add task on a subproject files into it without typing #
    await page.getByRole( `link`, { name: `#Clients` } ).click()
    await expect( page.getByText( `in Work` ) ).toBeVisible()
    await add( page, `Invoice` )
    await expect( page.getByRole( `button`, { name: `Invoice`, exact: true } ) ).toBeVisible()
    await expect( page.getByRole( `button`, { name: `Team lunch`, exact: true } ) ).toHaveCount( 0 )

    // Its Horizons board: lanes for this subtree only
    await page.getByRole( `link`, { name: `Horizons` } ).last().click()
    await expect( page.getByRole( `heading`, { name: `Horizons · Clients` } ) ).toBeVisible()
    await expect( page.getByRole( `region`, { name: `This week` } ).getByRole( `button`, { name: `Draft proposal`, exact: true } ) ).toBeVisible()
    await expect( page.getByRole( `region`, { name: `Someday` } ).getByRole( `button`, { name: `Invoice`, exact: true } ) ).toBeVisible()
    await expect( page.getByRole( `button`, { name: `Team lunch`, exact: true } ) ).toHaveCount( 0 )
} )

test( `the task detail lists projects as a tree and title shorthand moves a task into a subproject`, async ( { page } ) => {

    await page.goto( `/triage` )
    await add( page, `Seed #Home/Garden`, { create: true } )
    await add( page, `Seed #Work/Garden`, { create: true } )
    await add( page, `Rake leaves` )

    await page.getByRole( `button`, { name: `Rake leaves`, exact: true } ).click()
    const detail = page.getByRole( `dialog`, { name: /Task: Rake leaves/ } )
    await detail.getByLabel( `Title` ).fill( `Rake leaves #Home/Garden` )
    await detail.getByLabel( `Title` ).press( `Enter` )
    await expect( detail.getByLabel( `Title` ) ).toHaveValue( `Rake leaves` )

    // Same-named subprojects stay apart: the path picked Home's Garden
    const select = detail.getByLabel( `Project` )
    const chosen = await select.evaluate( element => element.selectedOptions[ 0 ].textContent.trim() )
    expect( chosen ).toBe( `Garden` )
    await page.keyboard.press( `Escape` )
    await page.goto( `/projects` )
    await page.getByRole( `link`, { name: /^Home/ } ).click()
    await expect( page.getByRole( `button`, { name: `Rake leaves`, exact: true } ) ).toBeVisible()
} )

test( `projects CRUD: create from the Projects page, rename, move, delete with Undo`, async ( { page } ) => {

    await page.goto( `/projects` )
    const name = page.getByLabel( `New project name` )
    await name.fill( `Work/Clients` )
    await name.press( `Enter` )
    await name.fill( `Home` )
    await page.getByRole( `button`, { name: `Add project` } ).click()
    await expect( page.getByRole( `link`, { name: /^Clients/ } ) ).toBeVisible()
    await expect( name ).toHaveValue( `` )

    // Rename; "/" is refused (it's path syntax), an empty name too
    await page.getByRole( `link`, { name: /^Clients/ } ).click()
    await add( page, `Invoice` )
    await page.getByRole( `button`, { name: `Edit` } ).click()
    const form = page.getByRole( `form`, { name: `Edit project` } )
    await form.getByLabel( `Name` ).fill( `Big/Clients` )
    await form.getByRole( `button`, { name: `Save` } ).click()
    await expect( form.getByRole( `alert` ) ).toContainText( `/` )
    await form.getByLabel( `Name` ).fill( `Customers` )

    // Move: its own subtree isn't offered, other projects are
    const inside = form.getByLabel( `Inside` )
    await expect( inside.locator( `option`, { hasText: `Customers` } ) ).toHaveCount( 0 )
    await inside.selectOption( { label: `Home` } )
    await form.getByRole( `button`, { name: `Save` } ).click()
    await expect( page.getByRole( `heading`, { name: `Customers`, exact: true } ) ).toBeVisible()
    await expect( page.getByText( `in Home` ) ).toBeVisible()

    // Delete: back to Projects, the task reads unfiled (Triage); Undo restores both
    await page.getByRole( `button`, { name: `Edit` } ).click()
    await expect( page.getByRole( `form`, { name: `Edit project` } ) ).toContainText( `1 open task become` )
    await page.getByRole( `button`, { name: `Delete project` } ).click()
    await expect( page ).toHaveURL( /\/projects$/ )
    await expect( page.getByRole( `link`, { name: /^Customers/ } ) ).toHaveCount( 0 )
    await page.getByRole( `button`, { name: `Undo` } ).click()
    await expect( page.getByRole( `link`, { name: /^Customers/ } ) ).toBeVisible()
    await page.getByRole( `link`, { name: /^Customers/ } ).click()
    await expect( page.getByRole( `button`, { name: `Invoice`, exact: true } ) ).toBeVisible()
} )

test( `sidebar project trees fold per group and per project, remembered across reloads`, async ( { page, isMobile } ) => {

    test.skip( isMobile, `phones have no sidebar trees` )
    await page.goto( `/triage` )
    await add( page, `Draft #Work/Clients`, { create: true } )
    const nav = page.getByRole( `navigation`, { name: `Main` } )
    const sub = name => nav.getByRole( `link`, { name } )

    // Fold Work under Horizons only: its child hides there, stays under Projects
    await nav.getByRole( `button`, { name: `Collapse Horizons: Work` } ).click()
    await expect( sub( `Horizons: Work/Clients` ) ).toHaveCount( 0 )
    await expect( sub( `Horizons: Work` ) ).toBeVisible()
    await expect( sub( `Projects: Work/Clients` ) ).toBeVisible()

    // Fold the whole Projects group
    await nav.getByRole( `button`, { name: `Collapse Projects list` } ).click()
    await expect( sub( `Projects: Work` ) ).toHaveCount( 0 )

    await page.reload()
    await expect( sub( `Horizons: Work` ) ).toBeVisible()
    await expect( sub( `Horizons: Work/Clients` ) ).toHaveCount( 0 )
    await expect( sub( `Projects: Work` ) ).toHaveCount( 0 )
    await nav.getByRole( `button`, { name: `Expand Horizons: Work` } ).click()
    await expect( sub( `Horizons: Work/Clients` ) ).toBeVisible()
} )
