import { useEffect, useId, useMemo, useRef, useState } from 'react'
import styled from 'styled-components'
import { CalendarDays, Clock, Flag, Hash, Plus, Repeat, Tag, TriangleAlert } from 'lucide-react'
import { parse_quick_add, resolve_date_label } from '@dolist/core'
import { add_label, add_project, add_task } from '@dolist/store'
import { use_labels, use_projects, use_store } from '@dolist/store/react'
import Chip from '../atoms/Chip'
import { use_app_store } from '../../stores/app'
import { use_today } from '../../hooks/use_today'
import { flush } from '../../modules/dolist'

const DRAFT_KEY = `dolist:draft:quick-add`

const read_draft = () => {
    try {
        return localStorage.getItem( DRAFT_KEY ) || ``
    } catch {
        return ``
    }
}

const write_draft = text => {
    try {
        if( text ) localStorage.setItem( DRAFT_KEY, text )
        else localStorage.removeItem( DRAFT_KEY )
    } catch {
        // Private mode: the draft lives only in memory
    }
}

const Box = styled.form`
    border: 1px solid var(--line); border-radius: var(--radius); background: var(--surface);
    padding: .45rem .6rem .45rem .75rem; margin-bottom: 1.25rem;
    transition: box-shadow 160ms var(--ease), border-color 160ms var(--ease);

    &:focus-within { box-shadow: 0 0 0 5px var(--accent-tint); border-color: var(--accent) }

    .line { display: flex; align-items: center; gap: .55rem; color: var(--faint) }
    .field { position: relative; flex: 1; min-width: 0 }
    .field input, .field .hl { font: 500 1rem/1.5 var(--font-body); padding: .25rem 0; width: 100%; border: 0; white-space: pre; letter-spacing: normal }
    .field input { position: relative; z-index: 1; background: transparent; color: transparent; caret-color: var(--fg); outline: none }
    .field input::placeholder { color: var(--faint) }
    .field .hl { position: absolute; inset: 0; pointer-events: none; color: var(--fg); overflow: hidden }
    .hl mark { background: none; color: var(--accent-strong) }
    .hl mark[data-unknown] { color: var(--muted); text-decoration: underline dotted }

    .chips { display: flex; gap: .3rem; flex-wrap: wrap; align-items: center; padding: .35rem 0 .1rem 1.6rem }
    .chips button { all: unset; cursor: pointer; display: inline-flex }
    .hint { font-size: .78rem; color: var(--muted) }
`

const ICONS = { date: CalendarDays, deadline: Flag, time: Clock, recur: Repeat, project: Hash, label: Tag, priority: Flag }

// Short human label for one parsed span
const chip_text = ( { type, value, raw }, today ) => {
    if( type === `date` ) return resolve_date_label( value, today )
    if( type === `deadline` ) return `by ${ resolve_date_label( value, today ) }`
    if( type === `priority` ) return `!${ value }`
    if( type === `project` ) return `#${ value }`
    if( type === `label` ) return `@${ value }`
    if( type === `field` ) return raw
    return raw
}

// Split text into plain + highlighted segments for the overlay
const segments_of = ( text, spans ) => {
    const sorted = [ ...spans ].filter( ( { type } ) => type !== `literal` ).sort( ( a, b ) => a.start - b.start )
    const parts = []
    let cursor = 0
    for( const span of sorted ) {
        if( span.start < cursor ) continue
        if( span.start > cursor ) parts.push( { text: text.slice( cursor, span.start ) } )
        parts.push( { text: text.slice( span.start, span.end ), span } )
        cursor = span.end
    }
    if( cursor < text.length ) parts.push( { text: text.slice( cursor ) } )
    return parts
}

/**
 * The one capture line. Live highlights + chips for what the grammar understood.
 * The draft survives reloads and blocks silent app updates while unsent.
 * Unknown #project / @label are never created silently: Enter once shows the offer, Enter again creates.
 */
export default function QuickAdd( { defaults = {}, placeholder = `Add a task… try "Call mum fri by sun !2 #home"`, autofocus } ) {

    const store = use_store()
    const projects = use_projects()
    const labels = use_labels()
    const today = use_today()
    const mark_unsaved = use_app_store( state => state.mark_unsaved )

    const id = useId()
    const input_ref = useRef( null )
    const hl_ref = useRef( null )
    const [ text, set_text ] = useState( read_draft )
    const [ confirm_create, set_confirm_create ] = useState( false )

    const parsed = useMemo( () => parse_quick_add( text, {
        today,
        projects: projects.map( ( { name } ) => name ),
        labels: labels.map( ( { name } ) => name ),
    } ), [ text, today, projects, labels ] )

    const unknown = parsed.spans.filter( ( { unknown } ) => unknown )

    // Persist the draft + tell the updater this tab holds unsent input.
    // Clearing the saved draft waits for the task's commit (see submit), so a kill in between loses nothing.
    useEffect( () => {
        if( text ) write_draft( text )
        mark_unsaved( id, !!text.trim() )
    }, [ text, id, mark_unsaved ] )
    useEffect( () => () => mark_unsaved( id, false ), [ id, mark_unsaved ] )

    const create_unknowns = () => unknown.forEach( ( { type, value } ) => {
        if( type === `project` ) add_project( store, { name: value } )
        if( type === `label` ) add_label( store, { name: value } )
    } )

    const submit = event => {

        event.preventDefault()
        const { task } = parsed
        if( !task.title.trim() ) return

        if( unknown.length && !confirm_create ) return set_confirm_create( true )
        if( unknown.length ) create_unknowns()

        const project_id = task.project
            ? projects.find( ( { name } ) => name.toLowerCase() === task.project.toLowerCase() )?.id
            : defaults.project_id
        add_task( store, {
            ...task,
            project_id: project_id ?? task.project_id ?? null,
            project: task.project ?? undefined,
            scheduled: task.scheduled ?? defaults.scheduled ?? null,
        } )

        set_text( `` )
        set_confirm_create( false )
        input_ref.current?.focus()
        flush().then( () => !input_ref.current?.value && write_draft( `` ) )
    }

    const change = ( { target: { value } } ) => {
        if( !value ) write_draft( `` )
        set_text( value )
        set_confirm_create( false )
    }

    // Keep the overlay scrolled with the input when text overflows
    const sync_scroll = () => {
        if( hl_ref.current && input_ref.current ) hl_ref.current.scrollLeft = input_ref.current.scrollLeft
    }

    const chips = parsed.spans.filter( ( { type } ) => type !== `literal` )

    return <Box onSubmit={ submit } aria-label="Quick add">
        <div className="line">
            <Plus size={ 18 } strokeWidth={ 1.5 } aria-hidden />
            <div className="field">
                <div className="hl" ref={ hl_ref } aria-hidden>
                    { segments_of( text, parsed.spans ).map( ( { text: part, span }, index ) => span
                        ? <mark key={ index } data-unknown={ span.unknown || undefined }>{ part }</mark>
                        : <span key={ index }>{ part }</span> ) }
                </div>
                <input
                    ref={ input_ref }
                    value={ text }
                    onChange={ change }
                    onScroll={ sync_scroll }
                    onKeyUp={ sync_scroll }
                    placeholder={ placeholder }
                    aria-label="New task"
                    autoFocus={ autofocus }
                    autoComplete="off"
                    enterKeyHint="done"
                />
            </div>
        </div>
        { !!chips.length && <div className="chips" aria-live="polite" aria-label="Understood">
            { chips.map( ( span, index ) => {
                const Icon = span.unknown ? Plus : ICONS[ span.type ] || Tag
                const tone = span.type === `deadline` ? `bad` : span.type === `priority` ? `p${ span.value }` : undefined
                return <Chip key={ index } data-tone={ tone } data-unknown={ span.unknown || undefined } data-conflict={ span.conflict || undefined }>
                    <Icon size={ 12 } aria-hidden />
                    { span.unknown ? `New ${ chip_text( span, today ) }` : chip_text( span, today ) }
                </Chip>
            } ) }
            { confirm_create && <span className="hint" role="status">
                <TriangleAlert size={ 12 } aria-hidden /> Enter again to create { unknown.map( span => chip_text( span, today ) ).join( `, ` ) }
            </span> }
        </div> }
    </Box>
}
