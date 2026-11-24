import { Inbox } from 'lucide-react'
import Page from '../atoms/Page'
import EmptyState from '../atoms/EmptyState'

export default function InboxPage() {
    return <Page title="Inbox">
        <EmptyState icon={ Inbox } title="Inbox is empty">
            Everything you capture lands here first.
        </EmptyState>
    </Page>
}
