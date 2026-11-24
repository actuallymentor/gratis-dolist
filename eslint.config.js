import { eslint_config } from 'airier'

// airier's rules, minus build output and throwaway spikes
export default [
    { ignores: [ `**/dist/**`, `**/dev-dist/**`, `spikes/**`, `design/**`, `**/node_modules/**` ] },
    ...eslint_config,
]
