import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { ACTIONS, DEFAULT_KEYMAP, RESERVED, action_for, combo_of, format_combo } from '../../modules/keymap'
import { use_app_store } from '../../stores/app'

/**
 * Settings rows: one per shortcut. Click the key, press a key or combination (Shift/Ctrl/Alt/⌘ + key);
 * Esc cancels, Backspace / Delete unbinds. A combo already in use is refused, naming its owner.
 */
export default function KeymapSection() {

    const keymap = use_app_store( state => state.keymap )
    const set_keymap = use_app_store( state => state.set_keymap )
    const [ recording, set_recording ] = useState( null )

    // While recording, the next real key press is the new binding; capture phase so global shortcuts never see it
    useEffect( () => {
        if( !recording ) return
        const on_key = event => {
            const combo = combo_of( event )
            if( !combo ) return
            event.preventDefault()
            event.stopPropagation()
            if( combo === `escape` ) return set_recording( null )
            if( combo === `backspace` || combo === `delete` ) {
                set_keymap( { ...keymap, [ recording ]: null } )
                return set_recording( null )
            }
            if( RESERVED.includes( combo ) ) return toast( `${ format_combo( combo ) } is reserved` )
            const owner = action_for( keymap, combo )
            if( owner && owner !== recording ) return toast( `${ format_combo( combo ) } is already “${ ACTIONS.find( ( { id } ) => id === owner ).label }”` )
            set_keymap( { ...keymap, [ recording ]: combo } )
            set_recording( null )
        }
        window.addEventListener( `keydown`, on_key, true )
        return () => window.removeEventListener( `keydown`, on_key, true )
    }, [ recording, keymap, set_keymap ] )

    const custom = ACTIONS.some( ( { id } ) => keymap[ id ] !== DEFAULT_KEYMAP[ id ] )

    return <>
        { ACTIONS.map( ( { id, label } ) => <div className="row" key={ id }>
            <span>{ label }{ recording === id && <small role="status">Press a key or combination. Esc cancels, Backspace clears.</small> }</span>
            <button type="button" className="key" aria-label={ `Shortcut for ${ label }: ${ format_combo( keymap[ id ] ) }` } aria-pressed={ recording === id }
                onClick={ () => set_recording( recording === id ? null : id ) } onBlur={ () => recording === id && set_recording( null ) }
            >
                { recording === id ? `Press keys…` : <kbd>{ format_combo( keymap[ id ] ) }</kbd> }
            </button>
        </div> ) }
        { custom && <div className="row">
            <span>Custom shortcuts<small>Back to n, /, j, k, e, m and ?.</small></span>
            <button type="button" onClick={ () => set_keymap( { ...DEFAULT_KEYMAP } ) }>Reset shortcuts</button>
        </div> }
    </>
}
