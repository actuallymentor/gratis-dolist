import { useEffect } from 'react'
import { useLocation } from 'react-router'
import styled from 'styled-components'
import toast from 'react-hot-toast'
import Modal from '../atoms/Modal'
import QuickAdd from './QuickAdd'
import { use_app_store } from '../../stores/app'
import { use_today } from '../../hooks/use_today'

// The capture box, borderless inside the dialog
const Capture = styled( QuickAdd )`
    margin: 0; border: 0; border-radius: var(--radius); padding: .9rem 1rem;
    &:focus-within { box-shadow: none }
`

/**
 * Global capture (`n` from anywhere): quick add in a centered modal, own draft slot.
 * On Today, new tasks default to today, like the page's own box. Closes once the task is handed off.
 */
export default function QuickAddModal() {

    const open = use_app_store( state => state.quick_add_open )
    const set_open = use_app_store( state => state.set_quick_add_open )
    const today = use_today()
    const { pathname } = useLocation()
    const close = () => set_open( false )

    useEffect( () => {
        if( !open ) return
        const on_key = event => event.key === `Escape` && set_open( false )
        window.addEventListener( `keydown`, on_key )
        return () => window.removeEventListener( `keydown`, on_key )
    }, [ open, set_open ] )

    if( !open ) return null

    const defaults = pathname.startsWith( `/today` ) ? { scheduled: today } : {}

    return <Modal label="New task" on_close={ close }>
        <Capture
            draft="quick-add-modal"
            defaults={ defaults }
            autofocus
            on_submit={ close }
            on_added={ title => toast( `Added “${ title }”`, { id: `added` } ) }
        />
    </Modal>
}
