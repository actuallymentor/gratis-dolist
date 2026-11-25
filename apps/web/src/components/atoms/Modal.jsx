import { useEffect, useState } from 'react'
import styled from 'styled-components'

const Backdrop = styled.div`
    position: fixed; inset: 0; z-index: 40;
    display: grid; place-items: center; padding: 1rem; overflow-y: auto;
    background: #1a1a2e40;
    animation: fade 200ms var(--ease);

    > [role="dialog"] {
        width: min( var(--modal-width, 36rem), 100% ); max-height: calc( 100dvh - 2rem ); overflow-y: auto;
        background: var(--surface); border-radius: var(--radius); box-shadow: 0 12px 32px #0003; outline: none;
        animation: rise 300ms cubic-bezier( .2, .8, .2, 1 );
    }

    /* Phones: a sheet from the bottom, thumb reach */
    @media ( max-width: 720px ) {
        place-items: end stretch; padding: 0;
        > [role="dialog"] { width: 100%; max-height: 92dvh; border-radius: var(--radius) var(--radius) 0 0; padding-bottom: env(safe-area-inset-bottom) }
    }

    @keyframes fade { from { opacity: 0 } }
    @keyframes rise { from { opacity: 0; transform: translateY( 6px ) } }
`

const FOCUSABLE = `a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])`

// Tab cycles inside the dialog instead of escaping to the page behind it
const trap_tab = event => {
    if( event.key !== `Tab` ) return
    const items = [ ...event.currentTarget.querySelectorAll( FOCUSABLE ) ].filter( item => item.offsetParent )
    if( !items.length ) return
    const [ first, last ] = [ items[ 0 ], items.at( -1 ) ]
    const outside = !event.currentTarget.contains( document.activeElement ) || document.activeElement === event.currentTarget
    if( event.shiftKey && ( document.activeElement === first || outside ) ) {
        event.preventDefault()
        last.focus()
    } else if( !event.shiftKey && ( document.activeElement === last || outside ) ) {
        event.preventDefault()
        first.focus()
    }
}

/**
 * Centered dialog over a dimmed page. Clicking the backdrop calls on_close; Escape is the caller's job
 * (callers commit edits first). Focus stays inside while open and returns to the opener on close
 * (so a j/k selection survives). The ref is the dialog element.
 */
export default function Modal( { ref, on_close, label, width, className, children, ...props } ) {

    // Captured at first render: autofocus inside the dialog runs before effects would see the opener
    const [ opener ] = useState( () => document.activeElement )
    useEffect( () => () => opener?.isConnected && opener.focus?.(), [ opener ] )

    return <Backdrop onMouseDown={ event => event.target === event.currentTarget && on_close?.() } style={ width && { '--modal-width': width } }>
        <div ref={ ref } role="dialog" aria-modal="true" aria-label={ label } tabIndex={ -1 } className={ className } onKeyDown={ trap_tab } { ...props }>
            { children }
        </div>
    </Backdrop>
}
