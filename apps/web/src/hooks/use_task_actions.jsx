import { useCallback } from 'react'
import { StringParam, useQueryParam } from 'use-query-params'
import toast from 'react-hot-toast'
import { complete_task, uncomplete_task } from '@dolist/store'
import { use_store } from '@dolist/store/react'
import { use_today } from './use_today'
import { flush } from '../modules/dolist'

/**
 * Shared task interactions for every list:
 * complete with an Undo toast, and open the detail panel (kept in the URL as ?task=id, so it survives reloads and back works).
 */
export const use_task_actions = () => {

    const store = use_store()
    const today = use_today()
    const [ open_id, set_open_id ] = useQueryParam( `task`, StringParam )

    const on_complete = useCallback( async task => {
        // Recurring tasks return the completed occurrence, so Undo reopens exactly that one
        const occurrence = complete_task( store, task.id, { today } ) ?? undefined
        // Ack only once on disk; a failed save is reported by the global save-error toast
        const saved = await flush().then( () => true, () => false )
        if( !saved ) return
        toast( t => <span>
            Completed “{ task.title }”
            <button onClick={ () => {
                uncomplete_task( store, task.id, occurrence )
                toast.dismiss( t.id )
            } }
            >Undo</button>
        </span>, { id: `complete-${ task.id }` } )
    }, [ store, today ] )

    const on_open = useCallback( task => set_open_id( task.id ), [ set_open_id ] )
    const on_close = useCallback( () => set_open_id( undefined ), [ set_open_id ] )

    return { today, open_id, on_complete, on_open, on_close }
}
