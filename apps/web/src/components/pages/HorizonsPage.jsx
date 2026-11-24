import styled from 'styled-components'
import Page from '../atoms/Page'

// Default Horizons recipe: rolling lanes, each task shown once by its soonest date (plan §7.1)
const LANES = [ `Today`, `This week`, `This month`, `This quarter` ]

const Board = styled.div`
    display: grid; grid-template-columns: repeat( 4, minmax( 0, 1fr ) ); gap: 1rem;

    section { background: var(--sunk); border-radius: var(--radius); padding: .9rem; min-height: 12rem }
    h2 { font: 600 .95rem var(--font-head); display: flex; justify-content: space-between }
    h2 span { color: var(--faint); font-weight: 500 }
    p { color: var(--faint); font-size: .88rem; margin-top: .75rem }

    @media ( max-width: 960px ) { grid-template-columns: repeat( 2, minmax( 0, 1fr ) ) }
    @media ( max-width: 560px ) { grid-template-columns: 1fr; section { min-height: 0 } }
`

export default function HorizonsPage() {
    return <Page title="Horizons" wide>
        <Board>
            { LANES.map( lane => <section key={ lane } aria-label={ lane }>
                <h2>{ lane } <span>0</span></h2>
                <p>Nothing here.</p>
            </section> ) }
        </Board>
    </Page>
}
