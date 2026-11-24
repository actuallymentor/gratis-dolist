import { Inbox } from 'lucide-react'
import { use_tasks } from '@dolist/store/react'
import Page from '../atoms/Page'
import EmptyState from '../atoms/EmptyState'
import QuickAdd from '../molecules/QuickAdd'
import TaskList from '../molecules/TaskList'
import { use_task_actions } from '../../hooks/use_task_actions'
import { inbox_tasks } from '../../modules/selectors'

export default function InboxPage() {

    const tasks = use_tasks()
    const { today, on_complete, on_open } = use_task_actions()

    return <Page title="Inbox">
        <QuickAdd autofocus />
        <TaskList tasks={ inbox_tasks( tasks ) } today={ today } on_complete={ on_complete } on_open={ on_open } empty={
            <EmptyState icon={ Inbox } title="Inbox is empty">Everything you capture lands here first.</EmptyState>
        }
        />
    </Page>
}
