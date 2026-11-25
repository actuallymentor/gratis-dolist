import { Download } from 'lucide-react'
import Pill from '../atoms/Pill'
import { use_app_store } from '../../stores/app'
import { is_standalone } from '../../modules/pwa'

// "Install app": only when the browser offered an install prompt and we're not already installed.
// iOS has no prompt; its how-to is a row in Settings, never floating over content.
export default function InstallPill() {

    const install_prompt = use_app_store( state => state.install_prompt )
    const set_install_prompt = use_app_store( state => state.set_install_prompt )
    if( !install_prompt || is_standalone() ) return null

    const install = async () => {
        await install_prompt.prompt()
        set_install_prompt( null )
    }

    return <Pill onClick={ install }>
        <Download size={ 16 } strokeWidth={ 1.5 } aria-hidden />
        Install app
    </Pill>
}
