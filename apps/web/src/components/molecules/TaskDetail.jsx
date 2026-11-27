import { useEffect, useId, useMemo, useRef, useState } from 'react'
import styled from 'styled-components'
import { Trash2, X } from 'lucide-react'
import { parse_quick_add } from '@dolist/core'
import { add_task, delete_task, restore_task, set_labels, update_task } from '@dolist/store'
import { use_labels, use_projects, use_store, use_tasks } from '@dolist/store/react'
import toast from 'react-hot-toast'
import TaskCard from './TaskCard'
import Modal from '../atoms/Modal'
import ShorthandField from '../atoms/ShorthandField'
import { use_today } from '../../hooks/use_today'
import { use_task_actions } from '../../hooks/use_task_actions'
import { use_app_store } from '../../stores/app'
import { flush } from '../../modules/dolist'
import { project_tree } from '../../modules/selectors'

const Panel = styled( Modal )`
    display: flex; flex-direction: column; gap: 1rem; padding: .75rem 1.25rem 1.5rem;

    header { display: flex; align-items: center; gap: .25rem; margin-right: -.5rem }
    header .title { flex: 1; font: 500 1.25rem var(--font-head) }
    header button, .danger {
        all: unset; cursor: pointer; display: inline-grid; place-items: center; min-width: 44px; min-height: 44px; border-radius: 999px; color: var(--muted);
        &:hover { background: var(--sunk); color: var(--fg) }
        &:focus-visible { box-shadow: 0 0 0 5px var(--accent-tint) }
    }

    textarea.notes { font: inherit; border: 1px solid var(--line-soft); border-radius: var(--radius-sm); background: var(--page); padding: .6rem .75rem; min-height: 6rem; resize: vertical }

    dl { display: grid; grid-template-columns: 7rem minmax( 0, 1fr ); gap: .35rem .75rem; align-items: center; margin: 0 }
    dt { color: var(--muted); font-size: .88rem }
    dd { margin: 0 }
    dd input, dd select {
        width: 100%; min-height: 40px; padding: 0 .6rem; border-radius: var(--radius-sm);
        border: 1px solid var(--line-soft); background: var(--page);
    }
    dd.pair { display: grid; grid-template-columns: minmax( 0, 1fr ) minmax( 0, 7rem ); gap: .4rem; min-width: 0 }
    dd.pair input { min-width: 0 }
    dd.pair input:disabled { opacity: .5 }
    .unparsed { color: var(--bad); font-size: .82rem }

    h3 { font: 600 .9rem var(--font-body); color: var(--muted); margin-top: .5rem }
    .subs { display: grid; gap: .4rem }
    .subs form input { width: 100%; min-height: 40px; padding: 0 .6rem; border-radius: var(--radius-sm); border: 1px dashed var(--line); background: none }
    .danger { color: var(--bad); padding: 0 1rem; justify-self: start; gap: .4rem; display: inline-flex; align-items: center }
`

// Stored protected ranges (quoted text at capture, e.g. `Read "by fri" book`) follow their text into the edited title
const carry_masks = ( { title, literal_mask }, text ) => {
    let ranges = literal_mask || []
    try {
        if( typeof ranges === `string` ) ranges = JSON.parse( ranges )
    } catch {
        ranges = []
    }
    let from = 0
    return ranges.flatMap( ( [ start, end ] ) => {
        const piece = title.slice( start, end )
        const at = piece ? text.indexOf( piece, from ) : -1
        if( at < 0 ) return []
        from = at + piece.length
        return [ [ at, at + piece.length ] ]
    } )
}

/**
 * Reads shorthand typed into an edited title. Protected text stays text; unknown #project / @label stay in
 * the title as written (the detail never creates names silently), so they're re-parsed as protected too.
 * @returns parse_quick_add result for saving + `highlights` (incl. unknown names, shown dotted)
 */
const parse_title = ( text, ctx, kept ) => {
    const first = parse_quick_add( text, { ...ctx, literal_ranges: kept } )
    const unknown = first.spans.filter( ( { unknown } ) => unknown ).map( ( { start, end } ) => [ start, end ] )
    const final = unknown.length ? parse_quick_add( text, { ...ctx, literal_ranges: [ ...kept, ...unknown ] } ) : first
    return { ...final, highlights: first.spans.filter( ( { type } ) => type !== `literal` ) }
}

// Only what the title's shorthand actually said; a bare time keeps an existing date
const shorthand_patch = ( task, { task: parsed, spans } ) => {
    const has = type => spans.some( span => span.type === type && !span.unknown )
    return {
        literal_mask: parsed.literal_mask ?? null,
        ...( has( `date` ) || has( `recur` ) || has( `time` ) && !task.scheduled ) && { scheduled: parsed.scheduled },
        ...has( `time` ) && { time: parsed.time },
        ...has( `deadline` ) && { deadline: parsed.deadline, deadline_time: parsed.deadline_time },
        ...has( `priority` ) && { priority: parsed.priority },
        ...has( `recur` ) && { recur: parsed.recur },
        ...has( `project` ) && { project_id: parsed.project_id ?? null },
        ...has( `label` ) && { labels: [ ...new Set( [ ...task.labels || [], ...parsed.labels ] ) ] },
    }
}

const PRIORITIES = [ [ ``, `None` ], [ `1`, `!1 Urgent` ], [ `2`, `!2 High` ], [ `3`, `!3 Medium` ], [ `4`, `!4 Low` ] ]

// Human text for a recurrence rule, so it can be edited as text and re-parsed
const recur_text = recur => {
    if( !recur ) return ``
    if( recur.unparsed ) return recur.raw
    return recur.text || recur.raw || ``
}

/**
 * Edit buffer for one field. Follows the stored value (e.g. a change from another tab) until the user
 * edits it, so committing an untouched field never writes stale text over newer data.
 * @returns {[ string, Function, boolean, Function ]} value, setter, dirty (user edited, not yet stored),
 *   settle( stored_text ) to call after saving, since what's stored may be normalised (trimmed, re-worded)
 */
const use_field = stored => {
    const [ field, set_field ] = useState( { value: stored, base: stored } )

    // Stored value moved: adopt it unless the user holds a different edit (render-phase derived state)
    if( field.base !== stored && ( field.value === field.base || field.value === stored ) ) set_field( { value: stored, base: stored } )

    const set_value = value => set_field( current => ( { ...current, value } ) )
    const settle = value => set_field( { value, base: value } )
    return [ field.value, set_value, field.value !== field.base, settle ]
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
    const tree = useMemo( () => project_tree( projects ), [ projects ] )
    const labels = use_labels()
    const today = use_today()
    const all_tasks = use_tasks()
    const panel_ref = useRef( null )
    const stored_labels = ( task.labels || [] ).join( `, ` )
    const stored_recur = recur_text( task.recur )
    const [ title, set_title, title_dirty, settle_title ] = use_field( task.title )
    const [ notes, set_notes, notes_dirty, settle_notes ] = use_field( task.notes || `` )
    const [ recur_input, set_recur_input, recur_dirty, settle_recur ] = use_field( stored_recur )
    const [ label_input, set_label_input, labels_dirty, settle_labels ] = use_field( stored_labels )
    const [ sub_text, set_sub_text ] = useState( `` )

    const subtasks = all_tasks.filter( ( { parent_id } ) => parent_id === task.id )
    const save = patch => update_task( store, task.id, patch )

    // Shorthand in an edited title is highlighted while typing, then applied and stripped on save
    const parse_ctx = () => ( {
        today,
        now: new Date().toTimeString().slice( 0, 5 ),
        projects,
        labels: labels.map( ( { name } ) => name ),
    } )
    const read_title = text => {
        const kept = carry_masks( task, text )
        const parsed = parse_title( text, parse_ctx(), kept )

        // A repeat added without a date continues from the task's own date (like the Repeats field), not from today
        const anchored = parsed.spans.some( ( { type } ) => type === `recur` ) && !parsed.spans.some( ( { type } ) => type === `date` ) && task.scheduled
        return anchored ? { ...parse_title( text, { ...parse_ctx(), today: task.scheduled, now: undefined }, kept ), highlights: parsed.highlights } : parsed
    }
    const title_highlights = useMemo( () => title_dirty ? read_title( title ).highlights : [], [ title, title_dirty, today, projects, labels, task ] ) // read_title is recreated per render

    // Each committer writes only what the user edited here
    const save_title = () => {
        if( !title_dirty || !title.trim() ) return
        const parsed = read_title( title )
        const clean = parsed.task.title.trim() || task.title
        save( { title: clean, ...shorthand_patch( task, parsed ) } )
        settle_title( clean )
    }
    const save_notes = () => {
        if( !notes_dirty ) return
        save( { notes } )
        settle_notes( notes )
    }

    // Only re-parse Repeats when its text changed, anchored on the task's own date (not today),
    // so tabbing through the field never shifts the schedule
    const save_recur = () => {
        const text = recur_input.trim()
        if( !recur_dirty ) return
        if( text === stored_recur.trim() ) return settle_recur( stored_recur )
        if( !text ) {
            save( { recur: null } )
            return settle_recur( `` )
        }
        const anchor = task.scheduled || task.deadline || today
        const { task: parsed, spans } = parse_quick_add( `x ${ text.startsWith( `every` ) ? text : `every ${ text }` }`, { today: anchor } )

        // Keep text the grammar didn't fully understand verbatim instead of half-parsing it
        const recur_span = spans.find( ( { type } ) => type === `recur` )
        const fully_parsed = parsed.recur && recur_span && parsed.title.trim() === `x`
        const recur = fully_parsed ? parsed.recur : { raw: text, unparsed: true }
        save( { recur } )
        settle_recur( recur_text( recur ) )
    }

    const save_labels = () => {
        if( !labels_dirty ) return
        const names = label_input.split( `,` ).map( name => name.trim().replace( /^@/, `` ) ).filter( Boolean )
        set_labels( store, task.id, names )
        settle_labels( names.join( `, ` ) )
    }

    // Latest committers, for close/unmount without stale closures
    const commit_ref = useRef( null )
    commit_ref.current = () => {
        save_title()
        save_notes()
        save_labels()
        save_recur()
    }

    const dirty = title_dirty || notes_dirty || labels_dirty || recur_dirty
    useEffect( () => mark_unsaved( id, dirty ), [ id, dirty, mark_unsaved ] )

    // Focus the panel on open (Modal restores the opener); Escape commits, then closes; unmount commits too
    useEffect( () => {
        panel_ref.current?.focus()
        const on_key = event => event.key === `Escape` && on_close()
        window.addEventListener( `keydown`, on_key )
        return () => {
            window.removeEventListener( `keydown`, on_key )
            commit_ref.current?.()
            mark_unsaved( id, false )
        }
    }, [ on_close, id, mark_unsaved ] )

    const add_sub = event => {
        event.preventDefault()
        if( !sub_text.trim() ) return
        const { task: parsed } = parse_quick_add( sub_text, { today, labels: labels.map( ( { name } ) => name ) } )
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

    return <Panel ref={ panel_ref } label={ `Task: ${ task.title }` } on_close={ on_close } width="38rem">
        <header>
            <ShorthandField className="title" value={ title } spans={ title_highlights } aria-label="Title"
                onChange={ ( { target: { value } } ) => set_title( value ) }
                onBlur={ save_title }
                onKeyDown={ event => event.key === `Enter` && event.currentTarget.blur() }
            />
            <button onClick={ on_close } aria-label="Close"><X size={ 20 } strokeWidth={ 1.5 } /></button>
        </header>

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
            <dd className="pair">
                <input id="d-deadline" type="date" value={ task.deadline || `` } onChange={ ( { target: { value } } ) => save( { deadline: value || null, ...!value && { deadline_time: null } } ) } />
                <input type="time" aria-label="Deadline time" disabled={ !task.deadline } value={ task.deadline_time || `` } onChange={ ( { target: { value } } ) => save( { deadline_time: value || null } ) } />
            </dd>

            <dt><label htmlFor="d-priority">Priority</label></dt>
            <dd><select id="d-priority" value={ task.priority || `` } onChange={ ( { target: { value } } ) => save( { priority: value ? Number( value ) : null } ) }>
                { PRIORITIES.map( ( [ value, label ] ) => <option key={ value } value={ value }>{ label }</option> ) }
            </select></dd>

            <dt><label htmlFor="d-project">Project</label></dt>
            <dd><select id="d-project" value={ task.project_id || `` } onChange={ ( { target: { value } } ) => save( { project_id: value || null } ) }>
                <option value="">No project</option>
                { tree.map( ( { id, name, depth } ) => <option key={ id } value={ id }>{ `\u2003`.repeat( depth ) }{ name }</option> ) }
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
