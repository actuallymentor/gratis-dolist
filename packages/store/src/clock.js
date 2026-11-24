// Per-store clock. M1 passes Date.now, M2 passes server-offset time so HLC stamps
// stay inside TinyBase's skew guard. Ops read it here so they stay `( store, ... )`.

const clocks = new WeakMap()

export const set_clock = ( store, get_now ) => clocks.set( store, get_now )
export const now_of = store => ( clocks.get( store ) ?? Date.now )()
