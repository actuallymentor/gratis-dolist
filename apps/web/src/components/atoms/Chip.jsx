import styled from 'styled-components'

// Small rounded token for parsed quick-add parts and task meta
const Chip = styled.span`
    display: inline-flex; align-items: center; gap: .3rem;
    font: 500 .76rem/1 var(--font-body); padding: .28rem .5rem; border-radius: 999px;
    background: var(--sunk); color: var(--muted); white-space: nowrap;

    &[data-tone="bad"] svg { color: var(--bad) }
    &[data-tone="p1"] svg { color: var(--p1) }
    &[data-tone="p2"] svg { color: var(--p2) }
    &[data-tone="p3"] svg { color: var(--p3) }
    &[data-unknown] { border: 1px dashed var(--line); background: none }
    &[data-conflict] { text-decoration: line-through }
`

export default Chip
