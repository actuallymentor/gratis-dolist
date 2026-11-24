import { create_dolist_store } from '@dolist/store'

/**
 * The tab's one local store. `flush()` resolves when queued writes are committed to IndexedDB:
 * every user-visible acknowledgement (toast, cleared draft) waits for it, so "acked" means "on disk".
 */
export const dolist = create_dolist_store()
export const flush = () => dolist.flush()
