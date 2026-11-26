import { expect } from '@playwright/test'

// Adding goes through the sidebar / tab-bar "Add task" button (or `n`): a modal with its own draft slot

export const quick_add = page => page.getByRole( `dialog`, { name: `New task` } ).getByRole( `textbox`, { name: `New task` } )

// Opens the modal unless it's already open; returns its textbox
export const open_add = async page => {
    if( !await quick_add( page ).isVisible() ) await page.getByRole( `navigation`, { name: `Main` } ).getByRole( `button`, { name: `Add task` } ).click()
    await expect( quick_add( page ) ).toBeFocused()
    return quick_add( page )
}

const draft_of = page => page.evaluate( () => localStorage.getItem( `dolist:draft:quick-add-modal:${ sessionStorage.getItem( `dolist:tab` ) }` ) )

/**
 * Adds one task like a user; waits for the durable ack (the modal's draft clears only once committed)
 * @param {{ create?: boolean }} [options] - create = confirm new #project / @label names (second Enter)
 */
export const add = async ( page, text, { create = false } = {} ) => {
    const box = await open_add( page )
    await box.fill( text )
    await box.press( `Enter` )
    if( create ) await box.press( `Enter` )
    await expect( quick_add( page ) ).toHaveCount( 0 )
    await expect.poll( () => draft_of( page ) ).toBe( null )
}
