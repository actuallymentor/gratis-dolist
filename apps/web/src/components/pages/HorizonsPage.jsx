import { useMemo, useState } from 'react'
import styled from 'styled-components'
import { ChevronDown } from 'lucide-react'
import toast from 'react-hot-toast'
import { default_horizons_recipe, distribute, move } from '@dolist/core'
import { update_task } from '@dolist/store'
import { use_store, use_tasks } from '@dolist/store/react'
import Page from '../atoms/Page'
import TaskCard from '../molecules/TaskCard'
import TaskList from '../molecules/TaskList'
import { use_task_actions } from '../../hooks/use_task_actions'
import { open_tasks } from '../../modules/selectors'

const Board = styled.div`
    display: grid; grid-template-columns: repeat( 4, minmax( 0, 1fr ) ); gap: 1rem; align-items: start;

    @media ( max-width: 960px ) { grid-template-columns: repeat( 2, minmax( 0, 1fr ) ) }
    @media ( max-width: 560px ) { grid-template-columns: 1fr }
`

const Lane = styled.section`
    display: grid; gap: .45rem; align-content: start; min-height: 10rem; padding: .6rem;
    border-radius: var(--radius); background: var(--sunk); outline: 2px dashed transparent;
    transition: background 160ms var(--ease), outline-color 160ms var(--ease);

    &[data-drop="ok"] { background: var(--accent-tint); outline-color: var(--accent) }
    &[data-drop="refused"] { outline-color: var(--bad) }

    h2 { font: 600 .95rem var(--font-head); display: flex; justify-content: space-between; padding: .15rem .25rem .3rem }
    h2 span { color: var(--faint); font-weight: 500; font-variant-numeric: tabular-nums }
    .empty { color: var(--faint); font-size: .85rem; padding: .25rem }
    .refusal { color: var(--bad); font-size: .8rem; padding: 0 .25rem }
`

const Mover = styled.div`
    position: fixed; inset: 0; z-index: 40; display: grid; place-items: center; background: #1a1a2e33;

    [role="menu"] { background: var(--surface); border-radius: var(--radius); padding: .5rem; min-width: 16rem; box-shadow: 0 12px 32px #0003 }
    p { color: var(--muted); font-size: .85rem; padding: .35rem .6rem }
    button { all: unset; display: flex; justify-content: space-between; width: 100%; box-sizing: border-box; min-height: 44px; padding: 0 .75rem; border-radius: var(--radius-sm); cursor: pointer }
    button:hover, button:focus-visible { background: var(--accent-tint) }
    button[aria-disabled="true"] { color: var(--faint); cursor: not-allowed }
    small { color: var(--bad) }
`

const Outside = styled.details`
    margin-top: 2rem;
    summary { cursor: pointer; color: var(--muted); display: inline-flex; align-items: center; gap: .35rem; min-height: 44px; list-style: none }
    summary::-webkit-details-marker { display: none }
    &[open] summary svg { transform: rotate( 180deg ) }
    > div { margin-top: .5rem }
`

/**
 * Horizons: the default recipe (rolling lanes, each task once by its soonest date).
 * Reschedule by dragging (live accept/refuse preview) or with the Move command (focus a card, press M).
 */
export default function HorizonsPage() {

    const store = use_store()
    const tasks = use_tasks()
    const { today, on_complete, on_open } = use_task_actions()
    const recipe = useMemo( () => default_horizons_recipe(), [] )
    const ctx = useMemo( () => ( { today } ), [ today ] )

    const { lanes, outside } = useMemo( () => distribute( open_tasks( tasks ), recipe, ctx ), [ tasks, recipe, ctx ] )

    const [ dragging, set_dragging ] = useState( null )
    const [ over, set_over ] = useState( null )
    const [ moving, set_moving ] = useState( null )

    const try_move = ( task, lane ) => {
        const result = move( task, lane.id, recipe, ctx )
        if( result.refused ) return toast( result.reason )
        update_task( store, task.id, result.patch )
        toast( `Moved to ${ lane.name }` )
    }

    // Live preview: what would happen if dropped here
    const verdict_of = lane => dragging ? move( dragging, lane.id, recipe, ctx ) : null

    const on_board_key = event => {
        if( event.key.toLowerCase() !== `m` || event.metaKey || event.ctrlKey ) return
        const card = event.target.closest?.( `[data-task-id]` )
        const task = card && tasks.find( ( { id } ) => id === card.dataset.taskId )
        if( !task ) return
        event.preventDefault()
        set_moving( task )
    }

    return <Page title="Horizons" wide>
        <Board onKeyDown={ on_board_key }>
            { lanes.map( lane => {
                const verdict = over === lane.id ? verdict_of( lane ) : null
                return <Lane key={ lane.id } aria-label={ lane.name }
                    data-drop={ verdict ? verdict.refused ? `refused` : `ok` : undefined }
                    onDragOver={ event => {
                        event.preventDefault()
                        set_over( lane.id )
                    } }
                    onDragLeave={ event => !event.currentTarget.contains( event.relatedTarget ) && set_over( null ) }
                    onDrop={ event => {
                        event.preventDefault()
                        if( dragging ) try_move( dragging, lane )
                        set_dragging( null )
                        set_over( null )
                    } }
                >
                    <h2>{ lane.name } <span>{ lane.tasks.length }</span></h2>
                    { verdict?.refused && <p className="refusal" role="status">{ verdict.reason }</p> }
                    { lane.tasks.map( task => <TaskCard key={ task.id } task={ task } today={ today } draggable
                        on_complete={ on_complete } on_open={ on_open }
                        on_drag_start={ event => {
                            event.dataTransfer.effectAllowed = `move`
                            event.dataTransfer.setData( `text/plain`, task.id )
                            set_dragging( task )
                        } }
                    /> ) }
                    { !lane.tasks.length && <p className="empty">Nothing here.</p> }
                </Lane>
            } ) }
        </Board>

        { !!outside.length && <Outside>
            <summary><ChevronDown size={ 16 } aria-hidden /> Outside this view ({ outside.length })</summary>
            <TaskList tasks={ outside } today={ today } on_complete={ on_complete } on_open={ on_open } />
        </Outside> }

        { moving && <Mover onClick={ () => set_moving( null ) } onKeyDown={ event => event.key === `Escape` && set_moving( null ) }>
            <div role="menu" aria-label={ `Move ${ moving.title }` } onClick={ event => event.stopPropagation() }>
                <p>Move “{ moving.title }” to…</p>
                { lanes.map( ( lane, index ) => {
                    const verdict = move( moving, lane.id, recipe, ctx )
                    return <button key={ lane.id } role="menuitem" autoFocus={ index === 0 } aria-disabled={ !!verdict.refused }
                        onClick={ () => {
                            if( verdict.refused ) return toast( verdict.reason )
                            try_move( moving, lane )
                            set_moving( null )
                        } }
                    >
                        { lane.name } { verdict.refused && <small>{ verdict.reason }</small> }
                    </button>
                } ) }
            </div>
        </Mover> }
    </Page>
}
