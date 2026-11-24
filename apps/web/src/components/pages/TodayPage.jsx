import { CalendarDays } from 'lucide-react'
import Page from '../atoms/Page'
import EmptyState from '../atoms/EmptyState'

const today_label = () => new Date().toLocaleDateString( undefined, { weekday: `long`, day: `numeric`, month: `long` } )

export default function TodayPage() {
    return <Page title="Today" subtitle={ today_label() }>
        <EmptyState icon={ CalendarDays } title="Nothing due today">
            Tasks scheduled or due today show up here.
        </EmptyState>
    </Page>
}
