import { CalendarDays } from 'lucide-react'
import Page from '../atoms/Page'
import EmptyState from '../atoms/EmptyState'
import { use_today } from '../../hooks/use_today'

const label_of = iso => new Date( `${ iso }T12:00` ).toLocaleDateString( undefined, { weekday: `long`, day: `numeric`, month: `long` } )

export default function TodayPage() {

    const today = use_today()

    return <Page title="Today" subtitle={ label_of( today ) }>
        <EmptyState icon={ CalendarDays } title="Nothing due today">
            Tasks scheduled or due today show up here.
        </EmptyState>
    </Page>
}
