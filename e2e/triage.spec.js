import { expect, test } from '@playwright/test'
import { add } from './ui.js'

// Triage filters, the sidebar Add task, shorthand search, deadline times

const card = ( page, title ) => page.getByRole( `button`, { name: title, exact: true } )
const toggle = ( page, name ) => page.getByRole( `group`, { name: `Show tasks that` } ).getByRole( `button`, { name } )

test( `triage: undated by default; toggles widen it and stick in the URL`, async ( { page } ) => {

    await page.goto( `/triage` )
    await expect( page.getByRole( `textbox`, { name: `New task` } ) ).toHaveCount( 0 ) // no inline add bar
    await add( page, `Loose idea` )
    await add( page, `Dentist tomorrow` )
    await add( page, `Report by fri` )
    await add( page, `Garden plan #Home`, { create: true } )

    await expect( card( page, `Loose idea` ) ).toBeVisible()
    await expect( card( page, `Garden plan` ) ).toBeVisible()
    await expect( card( page, `Dentist` ) ).toHaveCount( 0 )
    await expect( card( page, `Report` ) ).toHaveCount( 0 )
    await expect( toggle( page, `Has project` ) ).toHaveAttribute( `aria-pressed`, `true` )

    await toggle( page, `Has date` ).click()
    await expect( card( page, `Dentist` ) ).toBeVisible()
    await toggle( page, `Has deadline` ).click()
    await expect( card( page, `Report` ) ).toBeVisible()
    await toggle( page, `Has project` ).click()
    await expect( card( page, `Garden plan` ) ).toHaveCount( 0 )

    await page.reload()
    await expect( toggle( page, `Has date` ) ).toHaveAttribute( `aria-pressed`, `true` )
    await expect( card( page, `Garden plan` ) ).toHaveCount( 0 )
    await expect( card( page, `Report` ) ).toBeVisible()
} )

test( `by tom 16 = deadline tomorrow at 16:00`, async ( { page } ) => {

    await page.goto( `/horizons` )
    await add( page, `Submit form by tom 16` )
    const submit = page.locator( `[data-task-id]`, { has: card( page, `Submit form` ) } )
    await expect( submit.locator( `.deadline` ) ).toHaveText( /Tomorrow 16:00/ )

    await card( page, `Submit form` ).click()
    const detail = page.getByRole( `dialog`, { name: /Task: Submit form/ } )
    await expect( detail.getByLabel( `Deadline time` ) ).toHaveValue( `16:00` )
    await expect( detail.getByLabel( `Time`, { exact: true } ) ).toHaveValue( `` )
} )

test( `search reads shorthand`, async ( { page } ) => {

    await page.goto( `/search` )
    await add( page, `Pitch deck #Work tomorrow p2`, { create: true } )
    await add( page, `Team lunch #work by next week` )
    await add( page, `Call bank @sensitive p1`, { create: true } )
    await add( page, `Taxes @sensitive p3` )

    const box = page.getByRole( `textbox`, { name: `Search` } )
    const results = async ( query, titles ) => {
        await box.fill( query )
        for( const title of [ `Pitch deck`, `Team lunch`, `Call bank`, `Taxes` ] ) {
            await expect( card( page, title ) ).toHaveCount( titles.includes( title ) ? 1 : 0 )
        }
    }

    await results( `#work by next week`, [ `Team lunch` ] )
    await expect( page.locator( `main mark` ) ).toHaveText( [ `#work`, `by next week` ] )
    await results( `tomorrow p2`, [ `Pitch deck` ] )
    await results( `@sensitive p1 p2 p4`, [ `Call bank` ] )
    await results( `#work`, [ `Pitch deck`, `Team lunch` ] )
    await results( `bank`, [ `Call bank` ] )
} )
