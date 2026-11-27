import { useEffect, useState } from 'react'
import styled from 'styled-components'
import { ACTIONS, combo_of, format_combo } from '../../modules/keymap'
import { use_app_store } from '../../stores/app'

const ROWS = [
    [ `fri`, `Scheduled date: today, tom(orrow), mon…sun, 12 nov, in 3 days, next week` ],
    [ `by fri`, `Deadline (inclusive). before fri = the day before. by tom 16 = with a time` ],
    [ `at 3pm`, `Time: at 18, at 09:30, at 1500, at 5 (= 17:00)` ],
    [ `every week`, `Repeats from the scheduled date. every! = from completion` ],
    [ `!1 … !4`, `Priority (p1 … p4 also work)` ],
    [ `#home`, `Project (Enter twice creates a new one). #Work/Clients nests, #"Two words" for spaces` ],
    [ `@errands`, `Label` ],
    [ `"by the sea"`, `Quoted text stays in the title` ],
]

// Search reads the same shorthand as a query
const SEARCH = [
    [ `#work by fri`, `In Work (or a subproject), deadline by Friday` ],
    [ `tomorrow p2`, `Scheduled or due tomorrow, priority 2` ],
    [ `@call p1 p2`, `Labelled call, priority 1 or 2` ],
    [ `next week`, `Anything dated next week` ],
]

// Keys come from the (rebindable) keymap; Enter and Esc are fixed
const keys_of = keymap => [
    ...ACTIONS.map( ( { id, label } ) => [ format_combo( keymap[ id ] ), label ] ),
    [ `Enter`, `Open selected task` ],
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

// The cheatsheet key ("?" by default) opens the grammar + shortcut sheet from anywhere (except while typing)
export default function Cheatsheet() {

    const [ open, set_open ] = useState( false )
    const keymap = use_app_store( state => state.keymap )

    useEffect( () => {
        const on_key = event => {
            const typing = /input|textarea|select/i.test( event.target.tagName ) || event.target.isContentEditable
            if( combo_of( event ) === keymap.cheatsheet && !typing ) set_open( value => !value )
            if( event.key === `Escape` ) set_open( false )
        }
        window.addEventListener( `keydown`, on_key )
        return () => window.removeEventListener( `keydown`, on_key )
    }, [ keymap.cheatsheet ] )

    if( !open ) return null

    return <Sheet onClick={ () => set_open( false ) }>
        <div role="dialog" aria-label="Cheatsheet" onClick={ event => event.stopPropagation() }>
            <h2>Quick add</h2>
            <dl>{ ROWS.map( ( [ term, text ] ) => [ <dt key={ term }>{ term }</dt>, <dd key={ `${ term }-d` }>{ text }</dd> ] ) }</dl>
            <h3>Search</h3>
            <dl>{ SEARCH.map( ( [ term, text ] ) => [ <dt key={ term }>{ term }</dt>, <dd key={ `${ term }-d` }>{ text }</dd> ] ) }</dl>
            <h3>Keys</h3>
            <dl>{ keys_of( keymap ).map( ( [ term, text ] ) => [ <dt key={ text }>{ term }</dt>, <dd key={ `${ text }-d` }>{ text }</dd> ] ) }</dl>
        </div>
    </Sheet>
}
