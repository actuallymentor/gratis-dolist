import { QueryParamProvider } from 'use-query-params'
import { RouterAdapter } from './hooks/query_params_adapter'
import AppRoutes from './routes/Routes'
import Shell from './components/molecules/Shell'
import InstallPill from './components/molecules/InstallPill'
import UpdateBadge from './components/molecules/UpdateBadge'

export default function App() {
    return <QueryParamProvider adapter={ RouterAdapter }>
        <Shell>
            <AppRoutes />
        </Shell>
        <UpdateBadge />
        <InstallPill />
    </QueryParamProvider>
}
