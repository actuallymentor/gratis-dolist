import styled from 'styled-components'

const Box = styled.div`
    display: grid; justify-items: center; gap: .5rem; text-align: center;
    padding: 3rem 1rem; color: var(--muted);
    border: 1px dashed var(--line); border-radius: var(--radius);

    svg { color: var(--faint) }
    strong { color: var(--fg); font-weight: 600 }
    p { max-width: 32ch; font-size: .95rem }
`

// Calm placeholder for a list with nothing in it
export default function EmptyState( { icon: Icon, title, children } ) {
    return <Box>
        { Icon && <Icon size={ 28 } strokeWidth={ 1.5 } aria-hidden /> }
        <strong>{ title }</strong>
        { children && <p>{ children }</p> }
    </Box>
}
