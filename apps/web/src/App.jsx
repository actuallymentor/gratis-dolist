import { useEffect, useState } from 'react'
import { QueryParamProvider } from 'use-query-params'
import toast, { Toaster } from 'react-hot-toast'
import EmptyState from './components/atoms/EmptyState'
import Page from './components/atoms/Page'
import { DatabaseZap } from 'lucide-react'
import { StoreProvider } from '@dolist/store/react'
import { RouterAdapter } from './hooks/query_params_adapter'
import AppRoutes from './routes/Routes'
import Shell from './components/molecules/Shell'
import InstallPill from './components/molecules/InstallPill'
import UpdateBadge from './components/molecules/UpdateBadge'
import Cheatsheet from './components/molecules/Cheatsheet'
import OpenTask from './components/molecules/OpenTask'
import { use_task_actions } from './hooks/use_task_actions'
import { use_shortcuts } from './hooks/use_shortcuts'
import { dolist } from './modules/dolist'

const TOAST_STYLE = { background: `var(--fg)`, color: `var(--page)`, borderRadius: `999px`, fontSize: `.9rem` }

function Overlays() {
    const { open_id, on_close } = use_task_actions()
    use_shortcuts()
    return <>
        <OpenTask open_id={ open_id } on_close={ on_close } />
        <Cheatsheet />
    </>
}

export default function App() {

    // `ready` rejects when local data can't be read: never run (and autosave) on an empty store then
    const [ status, set_status ] = useState( `loading` )
    useEffect( () => {
        dolist.ready.then( () => set_status( `ready` ) ).catch( () => set_status( `failed` ) )

        // Every failed save surfaces; the ack that was waiting on it fails too
        return dolist.on_save_error( () => toast.error( `Some changes couldn't be saved on this device. Keep this tab open and try again.`, { id: `save-error`, duration: 10_000 } ) )
    }, [] )
    const ready = status === `ready`

    return <QueryParamProvider adapter={ RouterAdapter }>
        <Shell>
            { ready && <StoreProvider store={ dolist.store }>
                <AppRoutes />
                <Overlays />
            </StoreProvider> }
            { status === `failed` && <Page title="Can't open your tasks">
                <EmptyState icon={ DatabaseZap } title="Local data couldn't be read">
                    Nothing was changed or deleted. Close other Dolist tabs, then reload. If it keeps happening, check that your browser allows site storage.
                </EmptyState>
            </Page> }
        </Shell>
        <Toaster position="bottom-center" toastOptions={ { style: TOAST_STYLE, duration: 5_000 } } />
        <UpdateBadge />
        <InstallPill />
    </QueryParamProvider>
}
