import styled from 'styled-components'

// Round completion toggle, tinted by priority (1 = most urgent)
const Check = styled.button.attrs( ( { $done } ) => ( { type: `button`, role: `checkbox`, 'aria-checked': !!$done } ) )`
    position: relative; flex: none; width: 18px; height: 18px; margin-top: 2px; padding: 0;
    border-radius: 50%; border: 1.5px solid ${ ( { $priority } ) => $priority ? `var(--p${ $priority })` : `var(--p4)` };
    color: ${ ( { $priority } ) => $priority ? `var(--p${ $priority })` : `var(--p4)` };
    background: ${ ( { $priority } ) => $priority && $priority < 3 ? `color-mix(in srgb, var(--p${ $priority }) 9%, transparent)` : `none` };
    cursor: pointer;

    /* Generous invisible hit area without growing the visual */
    &::before { content: ""; position: absolute; inset: -13px }

    &::after {
        content: ""; position: absolute; inset: 0; margin: auto; width: 8px; height: 8px;
        border-radius: 50%; background: currentColor; opacity: ${ ( { $done } ) => $done ? 1 : 0 };
        transition: opacity 160ms var(--ease);
    }
    &:hover::after { opacity: ${ ( { $done } ) => $done ? 1 : .35 } }
`

export default Check
