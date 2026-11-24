import { useEffect, useId, useRef, useState } from 'react'
import styled from 'styled-components'
import { Trash2, X } from 'lucide-react'
import { parse_quick_add } from '@dolist/core'
import { add_task, delete_task, restore_task, set_labels, update_task } from '@dolist/store'
import { use_labels, use_projects, use_store, use_tasks } from '@dolist/store/react'
import toast from 'react-hot-toast'
import TaskCard from './TaskCard'
import { use_today } from '../../hooks/use_today'
import { use_task_actions } from '../../hooks/use_task_actions'
import { use_app_store } from '../../stores/app'
import { flush } from '../../modules/dolist'

const Panel = styled.aside`
    position: fixed; inset: 0 0 0 auto; z-index: 30; width: min( 30rem, 100% );
    display: flex; flex-direction: column; gap: 1rem; padding: 1.25rem 1.25rem 2rem; overflow-y: auto;
    background: var(--surface); border-left: 1px solid var(--line); box-shadow: -12px 0 32px #1a1a2e14;
    animation: enter 500ms cubic-bezier( .2, .8, .2, 1 );

    @keyframes enter { from { opacity: 0; transform: translateX( 8px ) } }

    header { display: flex; align-items: center; gap: .5rem; justify-content: flex-end }
    header button, .danger {
        all: unset; cursor: pointer; display: inline-grid; place-items: center; min-width: 44px; min-height: 44px; border-radius: 999px; color: var(--muted);
        &:hover { background: var(--sunk); color: var(--fg) }
        &:focus-visible { box-shadow: 0 0 0 5px var(--accent-tint) }
    }

    .title { font: 500 1.25rem/1.35 var(--font-head); border: 0; background: none; padding: .25rem 0; width: 100%; outline: none; resize: none }
    textarea.notes { font: inherit; border: 1px solid var(--line-soft); border-radius: var(--radius-sm); background: var(--page); padding: .6rem .75rem; min-height: 6rem; resize: vertical }

    dl { display: grid; grid-template-columns: 7rem 1fr; gap: .35rem .75rem; align-items: center; margin: 0 }
    dt { color: var(--muted); font-size: .88rem }
    dd { margin: 0 }
    dd input, dd select {
        width: 100%; min-height: 40px; padding: 0 .6rem; border-radius: var(--radius-sm);
        border: 1px solid var(--line-soft); background: var(--page);
    }
    .unparsed { color: var(--bad); font-size: .82rem }

    h3 { font: 600 .9rem var(--font-body); color: var(--muted); margin-top: .5rem }
    .subs { display: grid; gap: .4rem }
    .subs form input { width: 100%; min-height: 40px; padding: 0 .6rem; border-radius: var(--radius-sm); border: 1px dashed var(--line); background: none }
    .danger { color: var(--bad); padding: 0 1rem; justify-self: start; gap: .4rem; display: inline-flex; align-items: center }
`

const PRIORITIES = [ [ ``, `None` ], [ `1`, `!1 Urgent` ], [ `2`, `!2 High` ], [ `3`, `!3 Medium` ], [ `4`, `!4 Low` ] ]

// Human text for a recurrence rule, so it can be edited as text and re-parsed
const recur_text = recur => {
    if( !recur ) return ``
    if( recur.unparsed ) return recur.raw
    return recur.text || recur.raw || ``
}

/**
 * Task detail: every field of one task, edited in place, saved per field on change/blur.
 * Closing (Escape, close button, unmount) commits any text still being edited, and pending
 * edits mark the tab unsaved so an automatic app update never reloads them away.
 */
export default function TaskDetail( { task, on_close } ) {

    const id = useId()
    const mark_unsaved = use_app_store( state => state.mark_unsaved )
    const { on_complete, on_open } = use_task_actions()

    const store = use_store()
    const projects = use_projects()
    const labels = use_labels()
    const today = use_today()
    const all_tasks = use_tasks()
    const panel_ref = useRef( null )
    const [ title, set_title ] = useState( task.title )
    const [ notes, set_notes ] = useState( task.notes || `` )
    const [ recur_input, set_recur_input ] = useState( recur_text( task.recur ) )
    const [ label_input, set_label_input ] = useState( ( task.labels || [] ).join( `, ` ) )
    const [ sub_text, set_sub_text ] = useState( `` )

    const subtasks = all_tasks.filter( ( { parent_id } ) => parent_id === task.id )
    const save = patch => update_task( store, task.id, patch )

    const initial_labels = ( task.labels || [] ).join( `, ` )
    const initial_recur = recur_text( task.recur )

    const save_title = () => title.trim() && title !== task.title && save( { title: title.trim() } )
    const save_notes = () => notes !== ( task.notes || `` ) && save( { notes } )

    // Only re-parse Repeats when its text changed, anchored on the task's own date (not today),
    // so tabbing through the field never shifts the schedule
    const save_recur = () => {
        const text = recur_input.trim()
        if( text === initial_recur.trim() ) return
        if( !text ) return save( { recur: null } )
        const anchor = task.scheduled || task.deadline || today
        const { task: parsed, spans } = parse_quick_add( `x ${ text.startsWith( `every` ) ? text : `every ${ text }` }`, { today: anchor } )

        // Keep text the grammar didn't fully understand verbatim instead of half-parsing it
        const recur_span = spans.find( ( { type } ) => type === `recur` )
        const fully_parsed = parsed.recur && recur_span && parsed.title.trim() === `x`
        save( { recur: fully_parsed ? parsed.recur : { raw: text, unparsed: true } } )
    }

    const save_labels = () => {
        if( label_input === initial_labels ) return
        const names = label_input.split( `,` ).map( name => name.trim().replace( /^@/, `` ) ).filter( Boolean )
        set_labels( store, task.id, names )
    }

    // Latest committers, for close/unmount without stale closures
    const commit_ref = useRef( null )
    commit_ref.current = () => {
        save_title()
        save_notes()
        save_labels()
        save_recur()
    }

    const dirty = title !== task.title || notes !== ( task.notes || `` ) || label_input !== initial_labels || recur_input.trim() !== initial_recur.trim()
    useEffect( () => mark_unsaved( id, dirty ), [ id, dirty, mark_unsaved ] )

    // Focus management: focus the panel on open; Escape commits, then closes; unmount commits too
    useEffect( () => {
        const previous = document.activeElement
        panel_ref.current?.focus()
        const on_key = event => event.key === `Escape` && on_close()
        window.addEventListener( `keydown`, on_key )
        return () => {
            window.removeEventListener( `keydown`, on_key )
            commit_ref.current?.()
            mark_unsaved( id, false )
            previous?.focus?.()
        }
    }, [ on_close, id, mark_unsaved ] )

    const add_sub = event => {
        event.preventDefault()
        if( !sub_text.trim() ) return
        const { task: parsed } = parse_quick_add( sub_text, { today, projects: projects.map( ( { name } ) => name ), labels: labels.map( ( { name } ) => name ) } )
        add_task( store, { ...parsed, parent_id: task.id, project_id: task.project_id ?? null } )
        set_sub_text( `` )
    }

    const remove = async () => {
        delete_task( store, task.id )
        on_close()
        const saved = await flush().then( () => true, () => false )
        if( !saved ) return
        toast( t => <span>Deleted “{ task.title }” <button onClick={ () => {
            restore_task( store, task.id )
            toast.dismiss( t.id )
        } }
        >Undo</button></span> )
    }

    return <Panel ref={ panel_ref } tabIndex={ -1 } aria-label={ `Task: ${ task.title }` } role="dialog">
        <header>
            <button onClick={ on_close } aria-label="Close"><X size={ 20 } strokeWidth={ 1.5 } /></button>
        </header>

        <input className="title" value={ title } aria-label="Title"
            onChange={ ( { target: { value } } ) => set_title( value ) }
            onBlur={ save_title }
            onKeyDown={ event => event.key === `Enter` && event.currentTarget.blur() }
        />

        <textarea className="notes" value={ notes } placeholder="Notes" aria-label="Notes"
            onChange={ ( { target: { value } } ) => set_notes( value ) }
            onBlur={ save_notes }
        />

        <dl>
            <dt><label htmlFor="d-scheduled">Scheduled</label></dt>
            <dd><input id="d-scheduled" type="date" value={ task.scheduled || `` } onChange={ ( { target: { value } } ) => save( { scheduled: value || null } ) } /></dd>

            <dt><label htmlFor="d-time">Time</label></dt>
            <dd><input id="d-time" type="time" value={ task.time || `` } onChange={ ( { target: { value } } ) => save( { time: value || null } ) } /></dd>

            <dt><label htmlFor="d-deadline">Deadline</label></dt>
            <dd><input id="d-deadline" type="date" value={ task.deadline || `` } onChange={ ( { target: { value } } ) => save( { deadline: value || null } ) } /></dd>

            <dt><label htmlFor="d-priority">Priority</label></dt>
            <dd><select id="d-priority" value={ task.priority || `` } onChange={ ( { target: { value } } ) => save( { priority: value ? Number( value ) : null } ) }>
                { PRIORITIES.map( ( [ value, label ] ) => <option key={ value } value={ value }>{ label }</option> ) }
            </select></dd>

            <dt><label htmlFor="d-project">Project</label></dt>
            <dd><select id="d-project" value={ task.project_id || `` } onChange={ ( { target: { value } } ) => save( { project_id: value || null } ) }>
                <option value="">Inbox</option>
                { projects.map( ( { id, name } ) => <option key={ id } value={ id }>{ name }</option> ) }
            </select></dd>

            <dt><label htmlFor="d-labels">Labels</label></dt>
            <dd><input id="d-labels" value={ label_input } placeholder="errands, calls"
                onChange={ ( { target: { value } } ) => set_label_input( value ) } onBlur={ save_labels }
            /></dd>

            <dt><label htmlFor="d-recur">Repeats</label></dt>
            <dd>
                <input id="d-recur" value={ recur_input } placeholder="every week"
                    onChange={ ( { target: { value } } ) => set_recur_input( value ) } onBlur={ save_recur }
                />
                { task.recur?.unparsed && <span className="unparsed">Not understood, kept as written</span> }
            </dd>
        </dl>

        <h3>Subtasks</h3>
        <div className="subs">
            { subtasks.map( sub => <TaskCard key={ sub.id } task={ sub } today={ today } on_complete={ on_complete } on_open={ on_open } /> ) }
            <form onSubmit={ add_sub }>
                <input value={ sub_text } placeholder="Add subtask" aria-label="Add subtask" onChange={ ( { target: { value } } ) => set_sub_text( value ) } />
            </form>
        </div>

        <button className="danger" onClick={ remove }><Trash2 size={ 16 } strokeWidth={ 1.5 } aria-hidden /> Delete task</button>
    </Panel>
}
