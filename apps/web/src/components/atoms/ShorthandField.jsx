import { useRef } from 'react'
import styled from 'styled-components'

// Font comes from the parent: the input and its highlight overlay inherit it, so they always line up
const Field = styled.div`
    position: relative; flex: 1; min-width: 0;

    input, .hl { font: inherit; line-height: 1.5; padding: .25rem 0; width: 100%; border: 0; white-space: pre; letter-spacing: normal }
    input { position: relative; z-index: 1; background: transparent; color: transparent; caret-color: var(--fg); outline: none }

    /* The container's focus ring is the focus signal; no second ring on the bare input */
    input:focus-visible { box-shadow: none }
    input::placeholder { color: var(--faint) }
    .hl { position: absolute; inset: 0; pointer-events: none; color: var(--fg); overflow: hidden }
    .hl mark { background: none; color: var(--accent-strong) }
    .hl mark[data-unknown] { color: var(--muted); text-decoration: underline dotted }
`

// Split text into plain + highlighted segments for the overlay
const segments_of = ( text, spans ) => {
    const sorted = [ ...spans ].filter( ( { type } ) => type !== `literal` ).sort( ( a, b ) => a.start - b.start )
    const parts = []
    let cursor = 0
    for( const span of sorted ) {
        if( span.start < cursor ) continue
        if( span.start > cursor ) parts.push( { text: text.slice( cursor, span.start ) } )
        parts.push( { text: text.slice( span.start, span.end ), span } )
        cursor = span.end
    }
    if( cursor < text.length ) parts.push( { text: text.slice( cursor ) } )
    return parts
}

/**
 * Single-line input that highlights the shorthand the grammar will interpret (and strip on save).
 * A transparent input sits on a same-font overlay; the overlay scrolls with the caret.
 * @param {Object} props
 * @param {string} props.value
 * @param {Object[]} props.spans - parse_quick_add spans ( start, end, unknown )
 * Other props go to the <input>; the ref is the <input>.
 */
export default function ShorthandField( { ref, value, spans, className, onScroll, onKeyUp, ...input_props } ) {

    const own_ref = useRef( null )
    const input_ref = ref ?? own_ref
    const hl_ref = useRef( null )

    // Keep the overlay scrolled with the input when text overflows
    const sync_scroll = event => {
        if( hl_ref.current && input_ref.current ) hl_ref.current.scrollLeft = input_ref.current.scrollLeft
        if( event.type === `scroll` ) onScroll?.( event )
        if( event.type === `keyup` ) onKeyUp?.( event )
    }

    return <Field className={ className }>
        <div className="hl" ref={ hl_ref } aria-hidden>
            { segments_of( value, spans ).map( ( { text, span }, index ) => span
                ? <mark key={ index } data-type={ span.type } data-unknown={ span.unknown || undefined }>{ text }</mark>
                : <span key={ index }>{ text }</span> ) }
        </div>
        <input ref={ input_ref } value={ value } onScroll={ sync_scroll } onKeyUp={ sync_scroll } autoComplete="off" { ...input_props } />
    </Field>
}
