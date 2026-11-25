import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import styled from 'styled-components'
import { Check } from 'lucide-react'
import Page from '../atoms/Page'
import QuickAdd from '../molecules/QuickAdd'
import { shared_text } from '../../modules/share'

const Added = styled.ul`
    list-style: none; padding: 0; margin: 0; display: grid; gap: .35rem;
    li { display: flex; align-items: center; gap: .5rem; color: var(--muted); animation: enter 300ms var(--ease) }
    li svg { color: var(--accent) }
    @keyframes enter { from { opacity: 0; transform: translateY( 4px ) } }
`

const Footer = styled.p`
    margin-top: 1.5rem; color: var(--muted); font-size: .9rem;
    a { color: var(--accent-strong) }
`

/**
 * Capture-first screen: the installed app's start URL, its "Add task" shortcut and its share target.
 * One focused line, the accessory row, and a quiet list of what just landed in the Inbox.
 */
export default function CapturePage() {

    const [ params ] = useSearchParams()
    const navigate = useNavigate()
    const [ prefill ] = useState( () => shared_text( params ) )
    const [ added, set_added ] = useState( [] )

    // Shared text is now in the draft: drop it from the URL so a reload can't add it twice
    useEffect( () => {
        if( prefill ) navigate( `/capture`, { replace: true } )
    }, [ prefill, navigate ] )

    return <Page title="Add a task">
        <QuickAdd autofocus accessory prefill={ prefill || undefined } placeholder="What's on your mind?" on_added={ title => set_added( list => [ title, ...list ].slice( 0, 5 ) ) } />
        { !!added.length && <Added aria-label="Just added">
            { added.map( ( title, index ) => <li key={ `${ index }-${ title }` }><Check size={ 16 } strokeWidth={ 1.5 } aria-hidden /> { title }</li> ) }
        </Added> }
        <Footer>Everything lands in your <Link to="/inbox">Inbox</Link>.</Footer>
    </Page>
}
