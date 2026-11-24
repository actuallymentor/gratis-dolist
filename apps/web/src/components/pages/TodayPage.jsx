import { CalendarDays } from 'lucide-react'
import { use_tasks } from '@dolist/store/react'
import Page from '../atoms/Page'
import EmptyState from '../atoms/EmptyState'
import QuickAdd from '../molecules/QuickAdd'
import TaskList from '../molecules/TaskList'
import { use_task_actions } from '../../hooks/use_task_actions'
import { today_tasks } from '../../modules/selectors'

const label_of = iso => new Date( `${ iso }T12:00` ).toLocaleDateString( undefined, { weekday: `long`, day: `numeric`, month: `long` } )

export default function TodayPage() {

    const tasks = use_tasks()
    const { today, on_complete, on_open } = use_task_actions()

    return <Page title="Today" subtitle={ label_of( today ) }>
        <QuickAdd defaults={ { scheduled: today } } placeholder="Add a task for today…" />
        <TaskList tasks={ today_tasks( tasks, today ) } today={ today } on_complete={ on_complete } on_open={ on_open } empty={
            <EmptyState icon={ CalendarDays } title="Nothing due today">Tasks scheduled or due today show up here.</EmptyState>
        }
        />
    </Page>
}
