import styled from 'styled-components'

// Floating pill button (install, update). 32px face inside a ≥44px hit area.
const Pill = styled.button`
    position: fixed; bottom: max(1rem, env(safe-area-inset-bottom)); z-index: 20;
    ${ ( { $side } ) => $side === `right` ? `right: 1rem;` : `left: 1rem;` }
    display: inline-flex; align-items: center; gap: .4rem;
    min-height: 44px; padding: 0 1rem; border-radius: 999px; cursor: pointer;
    border: 1px solid var(--line); background: var(--surface); color: var(--fg);
    box-shadow: 0 2px 10px #1a1a2e14; font-size: .94rem;
    transition: transform 160ms var(--ease);

    &:hover { transform: translateY( -1px ) }
    &:active { transform: scale( .985 ) }
    &[data-tone="accent"] { background: var(--accent-strong); border-color: transparent; color: #fff }

    @media ( max-width: 720px ) { bottom: calc( 4.75rem + env(safe-area-inset-bottom) ) }
`

export default Pill
