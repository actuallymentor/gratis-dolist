import { memo } from 'react'
import styled from 'styled-components'
import { CalendarDays, Clock, Flag, Hash, Repeat, Tag } from 'lucide-react'
import { resolve_date_label } from '@dolist/core'
import Check from '../atoms/Check'

const Card = styled.article`
    display: grid; grid-template-columns: auto 1fr; gap: .2rem .6rem; align-items: start;
    padding: .6rem .75rem; border-radius: var(--radius-sm);
    background: var(--surface); border: 1px solid var(--line-soft);
    transition: border-color 160ms var(--ease), opacity 300ms var(--ease), transform 300ms var(--ease);

    &:hover { border-color: var(--line) }
    &[data-leaving] { opacity: 0; transform: translateX( 8px ) }
    &[draggable="true"] { cursor: grab }

    .title {
        all: unset; cursor: pointer; font-size: .95rem; font-weight: 500; line-height: 1.35; overflow-wrap: anywhere;
        &:focus-visible { box-shadow: 0 0 0 5px var(--accent-tint); border-radius: 4px }
    }
    .meta { grid-column: 2; display: flex; gap: .6rem; flex-wrap: wrap; font-size: .78rem; color: var(--muted) }
    .meta:empty { display: none }
    .meta span { display: inline-flex; align-items: center; gap: .22rem }
    .late { color: var(--bad) }
    .deadline svg { color: var(--bad) }
`

/**
 * One task: check, title (opens detail), quiet meta line.
 * Stateless apart from props; memoized because lanes render many.
 */
function TaskCard( { task, today, done, leaving, draggable, on_complete, on_open, on_drag_start } ) {

    const { title, priority, scheduled, deadline, time, labels = [], project, recur } = task
    const late = scheduled && scheduled < today

    return <Card data-leaving={ leaving || undefined } draggable={ draggable || undefined } onDragStart={ on_drag_start } data-task-id={ task.id }>
        <Check $priority={ priority } $done={ done } aria-label={ `Complete ${ title }` } onClick={ () => on_complete?.( task ) } />
        <button className="title" onClick={ () => on_open?.( task ) }>{ title }</button>
        <div className="meta">
            { scheduled && <span className={ late ? `late` : undefined }><CalendarDays size={ 12 } aria-hidden />{ resolve_date_label( scheduled, today ) }</span> }
            { time && <span><Clock size={ 12 } aria-hidden />{ time }</span> }
            { deadline && <span className="deadline" title="Deadline"><Flag size={ 12 } aria-hidden />{ resolve_date_label( deadline, today ) }</span> }
            { recur && <span title="Repeats"><Repeat size={ 12 } aria-label="Repeats" /></span> }
            { project && <span><Hash size={ 12 } aria-hidden />{ project }</span> }
            { labels.map( label => <span key={ label }><Tag size={ 12 } aria-hidden />{ label }</span> ) }
        </div>
    </Card>
}

export default memo( TaskCard )
