import { useEffect, useState } from 'react'
import styled from 'styled-components'

const ROWS = [
    [ `fri`, `Scheduled date: today, tom(orrow), mon…sun, 12 nov, in 3 days, next week` ],
    [ `by fri`, `Deadline (inclusive). before fri = the day before` ],
    [ `at 3pm`, `Time: at 18, at 09:30, at 1500, at 5 (= 17:00)` ],
    [ `every week`, `Repeats from the scheduled date. every! = from completion` ],
    [ `!1 … !4`, `Priority (p1 … p4 also work)` ],
    [ `#home`, `Project (Enter twice creates a new one). #Work/Clients nests, #"Two words" for spaces` ],
    [ `@errands`, `Label` ],
    [ `"by the sea"`, `Quoted text stays in the title` ],
]

const KEYS = [
    [ `n`, `New task, from anywhere` ],
    [ `j / k`, `Next / previous task` ],
    [ `Enter`, `Open selected task` ],
    [ `e`, `Complete selected task` ],
    [ `m`, `Move selected task (Horizons)` ],
    [ `/`, `Search` ],
    [ `?`, `This sheet` ],
    [ `Esc`, `Close` ],
]

const Sheet = styled.div`
    position: fixed; inset: 0; z-index: 50; display: grid; place-items: center; padding: 1rem; background: #1a1a2e40;

    [role="dialog"] { background: var(--surface); border-radius: var(--radius); padding: 1.25rem 1.5rem; max-width: 36rem; width: 100%; max-height: 90dvh; overflow-y: auto; box-shadow: 0 12px 32px #0003 }
    h2 { font-size: 1.1rem; margin-bottom: .75rem }
    h3 { font: 600 .85rem var(--font-body); color: var(--muted); margin: 1rem 0 .4rem }
    dl { display: grid; grid-template-columns: 8rem 1fr; gap: .4rem 1rem; margin: 0 }
    dt { font: .88rem ui-monospace, Menlo, monospace; color: var(--accent-strong) }
    dd { margin: 0; font-size: .9rem }
`

// "?" opens the grammar + shortcut sheet from anywhere (except while typing)
export default function Cheatsheet() {

    const [ open, set_open ] = useState( false )

    useEffect( () => {
        const on_key = event => {
            const typing = /input|textarea|select/i.test( event.target.tagName )
            if( event.key === `?` && !typing ) set_open( value => !value )
            if( event.key === `Escape` ) set_open( false )
        }
        window.addEventListener( `keydown`, on_key )
        return () => window.removeEventListener( `keydown`, on_key )
    }, [] )

    if( !open ) return null

    return <Sheet onClick={ () => set_open( false ) }>
        <div role="dialog" aria-label="Cheatsheet" onClick={ event => event.stopPropagation() }>
            <h2>Quick add</h2>
            <dl>{ ROWS.map( ( [ term, text ] ) => [ <dt key={ term }>{ term }</dt>, <dd key={ `${ term }-d` }>{ text }</dd> ] ) }</dl>
            <h3>Keys</h3>
            <dl>{ KEYS.map( ( [ term, text ] ) => [ <dt key={ term }>{ term }</dt>, <dd key={ `${ term }-d` }>{ text }</dd> ] ) }</dl>
        </div>
    </Sheet>
}
