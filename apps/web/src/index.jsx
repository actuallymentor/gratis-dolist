import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import App from './App'
import { listen_for_install, register_pwa } from './modules/pwa'
import { apply_theme, read_theme } from './modules/theme'
import './index.css'

apply_theme( read_theme() )
listen_for_install()
register_pwa()

createRoot( document.getElementById( `root` ) ).render( <StrictMode>
    <BrowserRouter>
        <App />
    </BrowserRouter>
</StrictMode> )
