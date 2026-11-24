import { useEffect, useState } from 'react'
import { QueryParamProvider } from 'use-query-params'
import { Toaster } from 'react-hot-toast'
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

    const [ ready, set_ready ] = useState( false )
    useEffect( () => {
        dolist.ready.then( () => set_ready( true ) )
    }, [] )

    return <QueryParamProvider adapter={ RouterAdapter }>
        <Shell>
            { ready && <StoreProvider store={ dolist.store }>
                <AppRoutes />
                <Overlays />
            </StoreProvider> }
        </Shell>
        <Toaster position="bottom-center" toastOptions={ { style: TOAST_STYLE, duration: 5_000 } } />
        <UpdateBadge />
        <InstallPill />
    </QueryParamProvider>
}
