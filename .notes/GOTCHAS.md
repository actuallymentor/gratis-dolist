# Gotchas

- User values calm UI: never put syntax legends/queries/toggles on the main surface; hide behind one quiet control.
- Mobile tap cost matters: avoid symbols beyond the iOS 123 layer (`# { } % *` are deep on iOS).
- New review round → new db collection (feedbackN) so old marks don't mix.
- Prototype popovers: handlers that re-render the pop must survive the document "click outside" listener (detached targets) and blur-on-remove re-entrancy. Verify with puppeteer-core + /usr/bin/google-chrome (playwright module absent); install puppeteer-core in scratchpad.
- Deploys: only via GH Actions (push to main). Local remote is SSH but no key in container → push with `gh auth setup-git` + https URL. Site currently = design prototype wrapped by scripts/build.mjs.
- Waiting on a process: never `until ! pgrep -f "X"` when X appears in the loop's own cmdline (self-match → infinite loop). Use `pgrep -x` / match `[c]odex exec`.
- `pkill -f "X"` inside a Bash call whose own command line also contains X kills the calling shell (exit 144). Kill by PID, or keep X out of the same command.
- npm workspaces: `vitest`/`eslint` run from root; spikes/ excluded from both on purpose.
- TinyBase: stock IndexedDB persister rewrites the whole store per save (~230 ms at 10k) → use `spikes/sync/src/idb-incremental.js` pattern. `load()`+`startAutoSave()`, never `startAutoPersisting()` (1 s full re-read). Bulk `setContent` of 10k freezes 4 s → batch imports.
- TinyBase skew guard (5 min) silently drops ALL edits from a fast-clock device, then later they overwrite newer edits → stamp with server-offset time.
- Acks must wait for `flush()` (apps/web/src/modules/dolist.js): an IDB write aborted by navigation within ms is lost. Toasts/draft-clear happen after commit.
- TinyBase `persister.schedule()` with no args throws on an empty queue; wait for persister status idle (store's `flush()` does).
- Lint `--fix` rewrites files mid-session → harness reports "changed on disk"; check `git diff` before assuming another agent touched it.
- TinyBase persisters swallow load/save errors (tryCatch → onIgnoredError; status still goes Idle). Store wraps get/set_persisted to record them: failed load → `ready` rejects, no autosave; failed save → `flush()` rejects + `on_save_error`. Full save without a successful load merges, never clears.
- `describe.skipIf` still runs the suite callback at collection: never read gitignored fixtures there unguarded.

- **Edit buffers must follow the store.** A local `useState(task.x)` committed on close overwrites other tabs' newer edits. Use a buffer with a base (TaskDetail `use_field`): adopt stored changes unless the user holds an edit; settle after save.
- **sessionStorage is copied** into duplicated / `window.open` tabs → "per-tab" ids collide. Verify uniqueness with a Web Lock `ifAvailable` (retry once for reload races); buffer draft writes in memory until the id is final.
- **A failed IDB write loses its delta.** Incremental persister sets `repair_pending`; the next save merges full content. Don't just clear the error.
