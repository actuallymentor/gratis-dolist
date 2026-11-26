import styled from 'styled-components'

const Wrap = styled.main`
    max-width: ${ ( { $wide } ) => $wide ? `none` : `60rem` };
    min-width: 0; margin: 0 auto;
    padding: 2rem ${ ( { $wide } ) => $wide ? `1.5rem` : `1rem` } 6rem;

    header { display: flex; align-items: baseline; gap: .75rem; margin-bottom: 1.5rem }
    h1 { font-size: 1.625rem }
    header p { color: var(--muted); font-size: .9rem }
`

// Page frame: title, optional subtitle, content
export default function Page( { title, subtitle, wide, children } ) {
    return <Wrap $wide={ wide }>
        <header>
            <h1>{ title }</h1>
            { subtitle && <p>{ subtitle }</p> }
        </header>
        { children }
    </Wrap>
}
