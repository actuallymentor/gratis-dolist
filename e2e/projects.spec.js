import { expect, test } from '@playwright/test'

// Nested projects: created from quick add (#name, #Parent/Child), listed under Projects and Horizons

const quick_add = page => page.getByRole( `textbox`, { name: `New task` } ).first()

// Unknown names need a second Enter (the create offer)
const add = async ( page, text, { create = false } = {} ) => {
    await quick_add( page ).fill( text )
    await quick_add( page ).press( `Enter` )
    if( create ) await quick_add( page ).press( `Enter` )
    await expect( quick_add( page ) ).toHaveValue( `` )
}

test( `#Parent/Child creates nested projects; the project page and its board scope to the subtree`, async ( { page, isMobile } ) => {

    await page.goto( `/inbox` )
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

    // Parent page shows its own and its subprojects' tasks, not the Inbox's
    await work.click()
    await expect( page.getByRole( `heading`, { name: `Work`, exact: true } ) ).toBeVisible()
    await expect( page.getByRole( `button`, { name: `Draft proposal`, exact: true } ) ).toBeVisible()
    await expect( page.getByRole( `button`, { name: `Team lunch`, exact: true } ) ).toBeVisible()
    await expect( page.getByRole( `button`, { name: `Water plants`, exact: true } ) ).toHaveCount( 0 )

    // Quick add on a subproject files into it without typing #
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

    await page.goto( `/inbox` )
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
