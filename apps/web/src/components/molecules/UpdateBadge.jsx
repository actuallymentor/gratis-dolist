import { RefreshCw } from 'lucide-react'
import Pill from '../atoms/Pill'
import { use_app_store } from '../../stores/app'
import { activate_update } from '../../modules/pwa'

// Persistent badge when an update waits on unsaved input; the user chooses when to reload
export default function UpdateBadge() {

    const update_ready = use_app_store( state => state.update_ready )
    if( !update_ready ) return null

    return <Pill $side="right" data-tone="accent" onClick={ activate_update }>
        <RefreshCw size={ 16 } strokeWidth={ 1.5 } aria-hidden />
        Update ready
    </Pill>
}
