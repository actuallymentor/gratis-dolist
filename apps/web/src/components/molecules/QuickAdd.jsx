import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import styled from 'styled-components'
import { CalendarDays, Clock, Flag, Hash, Plus, Repeat, Tag, TriangleAlert } from 'lucide-react'
import { parse_quick_add, resolve_date_label } from '@dolist/core'
import { add_label, add_task, ensure_project } from '@dolist/store'
import { use_labels, use_projects, use_store } from '@dolist/store/react'
import toast from 'react-hot-toast'
import Chip from '../atoms/Chip'
import ShorthandField from '../atoms/ShorthandField'
import { use_app_store } from '../../stores/app'
import { use_today } from '../../hooks/use_today'
import { flush } from '../../modules/dolist'
import { adopt_orphan_draft, read_draft as read_saved, write_draft as write_saved } from '../../modules/drafts'


const Box = styled.form`
    border: 1px solid var(--line); border-radius: var(--radius); background: var(--surface);
    padding: .45rem .6rem .45rem .75rem; margin-bottom: 1.25rem;
    transition: box-shadow 160ms var(--ease), border-color 160ms var(--ease);

    &:focus-within { box-shadow: 0 0 0 5px var(--accent-tint); border-color: var(--accent) }

    .line { display: flex; align-items: center; gap: .55rem; color: var(--faint); font: 500 1rem var(--font-body) }

    .accessory { display: flex; gap: .4rem; padding: .45rem 0 .1rem 1.6rem; overflow-x: auto }
    .accessory button, .accessory label {
        all: unset; cursor: pointer; position: relative; display: inline-grid; place-items: center; min-width: 44px; min-height: 40px; padding: 0 .7rem;
        border-radius: 999px; background: var(--sunk); color: var(--fg); font: 500 .95rem var(--font-body); box-sizing: border-box;
    }
    .accessory label input { position: absolute; inset: 0; opacity: 0; cursor: pointer }

    .chips { display: flex; gap: .3rem; flex-wrap: wrap; align-items: center; padding: .35rem 0 .1rem 1.6rem }
    .chips button { all: unset; cursor: pointer; display: inline-flex }
    .hint { font-size: .78rem; color: var(--muted) }
`

const ICONS = { date: CalendarDays, deadline: Flag, time: Clock, recur: Repeat, project: Hash, label: Tag, priority: Flag }

// Short human label for one parsed span
const chip_text = ( { type, value, raw }, today ) => {
    if( type === `date` ) return resolve_date_label( value, today )
    if( type === `deadline` ) return `by ${ resolve_date_label( value, today ) }`
    if( type === `time` ) return value
    if( type === `priority` ) return `!${ value }`
    if( type === `project` ) return `#${ value }`
    if( type === `label` ) return `@${ value }`
    if( type === `field` ) return raw
    return raw
}

/**
 * The one capture line. Live highlights + chips for what the grammar understood.
 * The draft survives reloads and blocks silent app updates while unsent.
 * Unknown #project / @label are never created silently: Enter once shows the offer, Enter again creates.
 * #Work/Clients creates (or finds) Clients under Work.
 */
/**
 * @param {Object} props
 * @param {Object} [props.defaults] - project_id / scheduled for tasks added here
 * @param {boolean} [props.autofocus]
 * @param {boolean} [props.accessory] - show the touch accessory row ( # @ ! by 📅 )
 * @param {Function} [props.on_added] - called with the saved task's title once it's on disk
 * @param {Function} [props.on_submit] - called right after the task is handed to the store (e.g. close a modal)
 * @param {string} [props.draft] - draft slot name; separate capture surfaces keep separate drafts
 */
export default function QuickAdd( { defaults = {}, placeholder = `Add a task… try "Call mum tom at 5 #home"`, autofocus, accessory, on_added, on_submit, draft = `quick-add`, className } ) {

    const store = use_store()
    const projects = use_projects()
    const labels = use_labels()
    const today = use_today()
    const mark_unsaved = use_app_store( state => state.mark_unsaved )

    // This tab's draft for this surface (see modules/drafts.js)
    const read_draft = () => read_saved( draft )
    const write_draft = value => write_saved( draft, value )

    const id = useId()
    const input_ref = useRef( null )
    const [ text, set_text ] = useState( read_draft )
    const [ confirm_create, set_confirm_create ] = useState( false )
    const last_text = useRef( text )

    // A tab that closed with unsent text hands it to the next one opened
    useEffect( () => {
        if( !text ) adopt_orphan_draft( draft ).then( adopted => adopted && set_text( adopted ) )
    }, [] )  

    // Wall-clock now (HH:MM), so "at 3pm" typed after 3pm rolls to tomorrow
    const now_hhmm = () => new Date().toTimeString().slice( 0, 5 )
    const parse = ( value, extra_projects = [], extra_labels = [] ) => parse_quick_add( value, {
        today,
        now: now_hhmm(),
        projects: [ ...projects, ...extra_projects ],
        labels: [ ...labels.map( ( { name } ) => name ), ...extra_labels ],
    } )

    const parsed = useMemo( () => parse( text ), [ text, today, projects, labels ] ) // parse is recreated per render

    const unknown = parsed.spans.filter( ( { unknown } ) => unknown )

    // Persist the draft + tell the updater this tab holds unsent input.
    // Clearing the saved draft waits for the task's commit (see submit), so a kill in between loses nothing.
    useEffect( () => {
        if( text ) write_draft( text )
        else if( read_draft() === last_text.current ) write_draft( `` )
        last_text.current = text
        mark_unsaved( id, !!text.trim() )
    }, [ text, id, mark_unsaved ] )
    useEffect( () => () => mark_unsaved( id, false ), [ id, mark_unsaved ] )

    const create_unknowns = () => unknown.forEach( ( { type, value } ) => {
        if( type === `project` ) ensure_project( store, value )
        if( type === `label` ) add_label( store, { name: value } )
    } )

    const submit = event => {

        event.preventDefault()
        if( !parsed.task.title.trim() ) return
        if( unknown.length && !confirm_create ) return set_confirm_create( true )

        // Create the confirmed names, then re-parse so the task actually gets them
        if( unknown.length ) create_unknowns()
        const name_of = type => unknown.filter( span => span.type === type ).map( ( { value } ) => value )
        const { task } = unknown.length ? parse( text, name_of( `project` ), name_of( `label` ) ) : parsed
        const submitted = text

        // Known rows carry their id; just-created ones resolve by path
        const project_id = task.project_id ?? ( task.project ? ensure_project( store, task.project ) : defaults.project_id )
        add_task( store, {
            ...task,
            project_id: project_id ?? null,
            project: task.project ?? undefined,
            scheduled: task.scheduled ?? defaults.scheduled ?? null,
        } )

        // The saved draft stays until the commit lands (below), so don't let the clear-effect remove it
        last_text.current = ``
        set_text( `` )
        set_confirm_create( false )
        input_ref.current?.focus()
        on_submit?.( task )

        // Clear the saved draft only once committed, and only if it's still ours (another tab may have its own)
        flush()
            .then( () => {
                if( read_draft() === submitted ) write_draft( `` )
                on_added?.( task.title )
            } )
            .catch( () => toast( `Couldn't save “${ task.title }”. Your text is kept as a draft.` ) )
    }

    const change = ( { target: { value } } ) => {
        set_text( value )
        set_confirm_create( false )
    }

    // Place the caret after the inserted token once React has rendered the new value
    const caret = useRef( null )
    useLayoutEffect( () => {
        if( caret.current === null ) return
        input_ref.current?.focus()
        input_ref.current?.setSelectionRange( caret.current, caret.current )
        caret.current = null
    }, [ text ] )

    // Accessory row: insert a token at the caret without blurring (the phone keyboard stays up)
    const insert = token => {
        const input = input_ref.current
        const start = input?.selectionStart ?? text.length
        const end = input?.selectionEnd ?? text.length
        const before = text.slice( 0, start )
        const spaced = `${ before && !before.endsWith( ` ` ) ? ` ` : `` }${ token }`
        const next = `${ before }${ spaced }${ text.slice( end ) }`
        caret.current = start + spaced.length
        set_text( next )
        set_confirm_create( false )
    }

    const keep_focus = event => event.preventDefault()

    const chips = parsed.spans.filter( ( { type } ) => type !== `literal` )

    return <Box onSubmit={ submit } aria-label="Quick add" className={ className }>
        <div className="line">
            <Plus size={ 18 } strokeWidth={ 1.5 } aria-hidden />
            <ShorthandField
                ref={ input_ref }
                value={ text }
                spans={ parsed.spans }
                onChange={ change }
                placeholder={ placeholder }
                aria-label="New task"
                autoFocus={ autofocus }
                enterKeyHint="done"
            />
        </div>
        { accessory && <div className="accessory" role="toolbar" aria-label="Insert">
            <button type="button" onPointerDown={ keep_focus } onClick={ () => insert( `#` ) } aria-label="Project">#</button>
            <button type="button" onPointerDown={ keep_focus } onClick={ () => insert( `@` ) } aria-label="Label">@</button>
            <button type="button" onPointerDown={ keep_focus } onClick={ () => insert( `!` ) } aria-label="Priority">!</button>
            <button type="button" onPointerDown={ keep_focus } onClick={ () => insert( `by ` ) } aria-label="Deadline">by</button>
            <label aria-label="Date"><CalendarDays size={ 18 } strokeWidth={ 1.5 } aria-hidden />
                <input type="date" tabIndex={ -1 } onChange={ ( { target } ) => {
                    if( target.value ) insert( `${ target.value } ` )
                    target.value = ``
                } }
                />
            </label>
        </div> }
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
