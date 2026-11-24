import { useEffect } from 'react'
import { useNavigate } from 'react-router'

// Global single-key shortcuts; ignored while typing in a field
export const use_shortcuts = () => {

    const navigate = useNavigate()

    useEffect( () => {
        const on_key = event => {
            if( event.metaKey || event.ctrlKey || event.altKey ) return
            if( /input|textarea|select/i.test( event.target.tagName ) ) return
            if( event.key === `/` ) {
                event.preventDefault()
                navigate( `/search` )
            }
            if( event.key === `n` ) {
                const input = document.querySelector( `form[aria-label="Quick add"] input` )
                if( input ) {
                    event.preventDefault()
                    input.focus()
                }
            }
        }
        window.addEventListener( `keydown`, on_key )
        return () => window.removeEventListener( `keydown`, on_key )
    }, [ navigate ] )
}
