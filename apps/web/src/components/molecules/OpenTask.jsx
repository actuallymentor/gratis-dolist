import { use_tasks } from '@dolist/store/react'
import TaskDetail from './TaskDetail'

// Renders the detail panel for ?task=id, wherever the user is
export default function OpenTask( { open_id, on_close } ) {
    const tasks = use_tasks()
    const task = open_id && tasks.find( ( { id } ) => id === open_id )
    if( !task ) return null
    return <TaskDetail key={ task.id } task={ task } on_close={ on_close } />
}
