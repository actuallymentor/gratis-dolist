import { AtSign, CircleCheck, Columns3, FolderTree, ListFilter, LogIn, PanelLeft, Plus, Search, Settings } from 'lucide-react'

/**
 * Sidebar items by key (order + visibility: modules/sidebar, per device).
 *   to = route (absent = a button) · tree = projects/labels listed under it · desktop_only = not in the phone tab bar
 *   bottom = pinned to the sidebar's foot while it stays at the end of the order
 */
export const NAV_ITEMS = {
    add: { label: `Add task`, Icon: Plus },
    triage: { to: `/triage`, label: `Triage`, Icon: ListFilter },
    horizons: { to: `/horizons`, label: `Horizons`, Icon: Columns3, tree: `projects` },
    projects: { to: `/projects`, label: `Projects`, Icon: FolderTree, tree: `projects` },
    labels: { to: `/labels`, label: `Labels`, Icon: AtSign, tree: `labels`, desktop_only: true },
    search: { to: `/search`, label: `Search`, Icon: Search },
    completed: { to: `/completed`, label: `Completed`, Icon: CircleCheck, desktop_only: true },
    signin: { to: `/signin`, label: `Sign in`, Icon: LogIn, desktop_only: true, signed_out_only: true, bottom: true },
    settings: { to: `/settings`, label: `Settings`, Icon: Settings, bottom: true },
    customize: { label: `Sidebar settings`, Icon: PanelLeft, desktop_only: true, bottom: true },
}
