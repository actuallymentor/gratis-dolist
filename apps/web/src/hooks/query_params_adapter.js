import { useLocation, useNavigate } from 'react-router'

/**
 * use-query-params adapter for react-router ≥7 (the bundled adapter imports react-router-dom)
 */
export const RouterAdapter = ( { children } ) => {
    const location = useLocation()
    const navigate = useNavigate()
    const adapter = {
        replace: ( { search, state } ) => navigate( { search }, { replace: true, state } ),
        push: ( { search, state } ) => navigate( { search }, { replace: false, state } ),
        get location() {
            return location
        },
    }
    return children( adapter )
}
