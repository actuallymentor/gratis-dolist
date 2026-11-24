const KEY = `dolist:theme`

// Theme: `system` (default) | `light` | `dark`, remembered per device
export const read_theme = () => {
    try {
        return localStorage.getItem( KEY ) || `system`
    } catch {
        return `system`
    }
}

export const apply_theme = theme => {
    if( theme === `system` ) delete document.documentElement.dataset.theme
    else document.documentElement.dataset.theme = theme
    try {
        localStorage.setItem( KEY, theme )
    } catch {
        // Private mode: theme lasts for this session only
    }
}
