# Dolist — implementation plan

Status: **v2**, 2026-11-24. v1 reviewed by 5 independent reviewers (simplicity, systems, product, perf/DX, security); their findings are merged below.
Inputs: round 1 marks, round 2 philosophy, round 3 review inputs (`RESEARCH_PLAN.md`), stack research 2026-11-24.
`design/prototype.html` = behavioural reference only. Nothing ships from it.

---

## 0. Product

Local-first task app: **capture is instant, views are editable recipes**. Web = main surface. Mobile = capture + widgets. Desktop = global capture hotkey.

| Rule (from your feedback) | Consequence |
|---|---|
| Calm: show results, hide machinery | No syntax/queries/toggles on main surfaces; one quiet control per layer |
| Common easy, uncommon possible | Rungs: type+Enter → words → presets + move → Simple editor → Text → code |
| Thumbs first | Words + iOS-123 symbols (`! @ :`); `#` via accessory key; no braces |
| Capture < 2 s, offline | Defined in §5; local durable write first, sync later |
| Views are data | Recipe JSON, copy/paste-able; presets are shipped recipes |
| Two dates | `scheduled` ≠ `deadline`, everywhere |
| Every gesture has a command | Drag / swipe always have a Move/Reschedule command (touch, keyboard, assistive tech) |

**Committed scope** = round 1 "want" minus what the reviews pushed to "later": filter-lane boards, cascade, move rewrites dates, two dates, recurrence, subtasks, custom fields, dependencies, recipes as text, theme + density, offline sync, Todoist import, shorthand, desktop hotkey, widgets (capture + lane + lock screen), capture sheet, share sheet, email-in, API + CLI.

**Later, uncommitted** (needs its own design + security gate after daily use proves the core): webhooks, plugins. Executable user filters are **removed** (recipes + filter language cover it).
**Maybe**: urgency score, grouping within lanes. **Dropped**: calendar, weekly review, AI triage, voice, watch, capture-bar widget, templates, formula fields, self-hosted sync.

---

## 1. Architecture

```
gratis-dolist/                       npm workspaces, one lockfile
├── packages/
│   ├── core/      pure JS: model, grammar, dates, recurrence, filters, recipes. Clock/tz/locale injected
│   └── store/     TinyBase schema, persisters, sync client, migrations. Platform exports (web / native)
├── apps/
│   ├── web/       Vite + React PWA (main surface)
│   ├── worker/    Worker `dolist`: assets + /api (Hono) + /sync (DO per user) + auth
│   ├── intake/    Worker `dolist-intake`: email() only, append-only service binding to worker
│   ├── mobile/    Expo SDK 58 (iOS + Android) + widgets + App Intents
│   └── desktop/   Tauri 2: capture-only window + global hotkey
└── .github/workflows/
```

| Concern | Choice | Fallback / note |
|---|---|---|
| Web | React + Vite, JS, styled-components, react-router, use-query-params, vite-plugin-pwa, lucide-react, mentie. **zustand only for UI state**; tasks live in TinyBase | — |
| Data + sync | TinyBase **≥ 10.1** MergeableStore. Web: own incremental IndexedDB persister (row-level writes + stored hashes; stock persister fails the 100 ms write budget at 10k, spike A) + BroadcastChannel synchronizer across tabs. Native: expo-sqlite (JSON mode). Server: `WsServerDurableObject`, one DO per user, SQLite (fragmented) | Spike A: **go** (`spikes/sync/RESULTS.md`). Client clock = server time offset from handshake; keep 5 min skew guard + "device clock is off" hint. First sync: gzipped HTTP snapshot, then WS. Gate passed (§3). Fallback: own per-field LWW op-log in the same DO, contained in `packages/store` |
| Auth | Typed credentials (§4) in D1, hashes only | — |
| API | Hono on the Worker | — |
| Dates | chrono-node (`/en`) inside our grammar; floating dates vs instants (§2.4) | — |
| Recurrence | Own parser → `{freq, interval, byday, bymonthday, anchor}` + occurrence model (§2.3) | rrule-temporal only if iCal import ever matters |
| Widgets / intents | **Spike official `expo-widgets` + `expo-app-intents` (SDK 58) first**; custom Swift / Glance targets only for proven gaps | `@bacons/apple-targets`, `react-native-android-widget` |
| Share | `expo-sharing` receive (text, URL) | `expo-share-intent` |
| Desktop | Tauri 2, capture-only UI, native global shortcut, enumerated capabilities | Electron |
| Email-in | Separate intake Worker, `postal-mime`, text only | — |

**URL state**: use-query-params per your tooling default; revisit only if it fights react-router's search params.

---

## 2. Core contracts (`packages/core` + `packages/store`)

Written and tested **before** UI that depends on them. Pure functions; clock, timezone, week start, locale are parameters (the prototype's fixed `today` + ms day maths is not a contract).

### 2.1 Data model: normalized for real per-field merging

TinyBase merges per cell. Anything edited independently gets its own cell or row, so two devices editing different things never collide.

| Table | Row key | Cells |
|---|---|---|
| `tasks` | task id (uuid v7) | `title`, `notes`, `project_id` (null = Inbox), `parent_id`, `priority`, `scheduled` (floating date), `time`, `tz` (only when timed), `duration`, `deadline` (floating date), `recur` (JSON, edited as a unit), `created_at`, `completed_at` (non-recurring), `deleted_at`, `literal_mask` |
| `task_labels` | `task:label` | `on` (bool; false = removed, keeps merge history) |
| `task_fields` | `task:field` | `value` |
| `task_blockers` | `task:blocker` | `on` |
| `completions` | `task:occurrence_date` | `at`, `device` (idempotent per occurrence; undo = delete row) |
| `orders` | `scope:task` (scope = project / parent / view-lane) | `rank` (fractional index), ties broken by task id |
| `projects` / `labels` / `field_defs` / `views` | id | as v1; `views.recipe` JSON edited as a unit |
| `meta` | `schema` | `version`, `min_client` |

### 2.2 Data lifecycle

- **Delete = tombstone** (`deleted_at`). Edits never resurrect a tombstoned task; restore clears `deleted_at`. Tombstones are never pruned in v1 (data is small).
- **References**: deleting a project moves tasks to Inbox; deleting a parent orphans subtasks to its project; deleting a blocker clears the block (never silently hides a task); deleting a label/field drops memberships.
- **Schema versioning**: additive-only migrations, idempotent, run on load. Unknown cells are preserved, not dropped. `min_client` lets the server refuse clients that would corrupt data (shown as "Update Dolist").
- **Backups**: JSON export/import in Settings (M1); DO keeps a nightly snapshot in its own SQLite (M2); restore path tested before real-data dogfooding.

### 2.3 Recurrence

- A recurring task has one row + `completions` rows. The current occurrence = first rule date ≥ anchor without a completion.
- `anchor: schedule` → next after the occurrence date; `anchor: completion` (`every!`) → next after the completion date.
- Two devices completing the same occurrence offline write the same `completions` key → idempotent, no double advance.
- Missed occurrences: schedule-anchored shows only the oldest undone (no pile-up); "Skip" writes a completion with `skipped`.
- Month-end: `every month on 31` → last day in short months. Deadline on a recurring task moves by the same offset.
- Subtasks of a recurring task reset per occurrence (checked state is per-occurrence completions).
- Imported rules we can't parse are **kept verbatim and flagged** ("Repeats: every 3rd tue (not understood)"), never silently dropped.

### 2.4 Dates

- `scheduled` / `deadline` are **floating calendar dates** (YYYY-MM-DD). Times are wall-clock + tz. Travel doesn't move "Friday".
- "Today" recomputes at local midnight and on resume. DST and leap days are covered by the test table.
- Grammar contract table (tests): `fri` on a Friday → next week (resolved date always shown); `by` = inclusive, `before` = day before; past time today → tomorrow; repeated tokens → last wins + conflict marker on chips.

### 2.5 Grammar v1

Whole-word dates, `by/before` deadline, `at` time, `every` / `every!` recurrence, `!1–!4` (+ optional `p1` alias), `#project`, `@label`, `field:value` **only for defined fields**, `"…"` literal (curly + unclosed handled). Parser returns `{task, spans}`; chips are editable; "Keep as title" → `literal_mask`. Unknown `#project` / `@label` → offer create, never silent create.
**Corpus gate**: titles from your real Todoist export (M0 spike C) + hand cases. Metric: zero title corruption.

### 2.6 Filters + recipes

Filter language (`& | ! ( )`, `date: due: deadline:` + `today|Nd|week|month|quarter|none`, `overdue`, `!1–!4`, `#proj`, `@label`, `field:value`) + `blocked`, `ready`, `recurring`, `has:deadline`, `sub`. `describe(query)` → English + effective range under cascade.
`distribute(state, recipe, ctx)` → lanes + `outside` list (not just a count). `move(task, lane, ctx)` → `{patch}` | `{refused, reason}`; the patch must satisfy the destination under source filter, cascade and blocker rules. Recipe lane `drop: auto | {set:…} | none`.

---

## 3. Milestones: vertical slices

Each ends **deployed and used like a user** (real browser / real device). Main → prod via GitHub Actions.

| # | Milestone | Ships | Exit criteria |
|---|---|---|---|
| **M0** | Foundation + spikes | Monorepo, `.nvmrc`, airier lint, Vitest, Playwright, hardened CI (§6). Prod shows the **empty app shell** (brainstorm page gone). **Spike A, sync**: TinyBase on IndexedDB + DO with 10k tasks: hydration, save latency, kill-right-after-capture, two tabs, offline edits, clock skew. **Spike C, data**: read-only Todoist export of your account → grammar corpus + fixtures | Spike A meets budgets (§5) → TinyBase go/no-go. Corpus exists |
| **M1** | Daily core (web, one device) | Durable capture (quick add, highlight, editable chips, "?" cheatsheet) → Inbox → **one Horizons recipe** → task detail (title, notes, both dates, time, priority, project, labels, recurrence, subtasks) → reschedule via **Move command** + drag with live preview → complete / undo → **search** (title + notes) → **completed history** with reopen → "Outside this view" list → export/import JSON. Minimal Todoist import (projects, labels, tasks, dates, deadlines, priority; unparsed recurrence kept verbatim). PWA: offline, deferred update activation, drafts persisted, install pill, build hash | One real week of use incl. offline. Playwright: full flow keyboard-only + pointer; upgrade test with an unsent draft |
| **M2** | Sync + auth | Worker `/api` + `/sync` (DO per user), accounts: passkey + email link (§4), revoke disconnects live sockets, nightly DO snapshot + tested restore, multi-tab via BroadcastChannel | Two browsers + offline edits converge (real `wrangler dev`, `context.setOffline`); revoked device drops within seconds; snapshot restore verified |
| **M3** | Capture anywhere (PWA) | Installable PWA on phone + desktop: capture-first launch (`/capture` start URL, manifest `id: /` keeps installs the same app), manifest shortcuts ("Add task", "Today") for Android/desktop long-press, Web Share Target (GET) → `/capture` shows a separate shared card (plain title + notes, never parsed as grammar, kept in the URL until added or discarded); capture screen with accessory row (`#` `@` `!` `by` 📅); iOS "Add to Home Screen" how-to as a Settings row (no floating pill: it covered content) | Phone home-screen icon → keyboard focused ≤ 1.5 s; airplane-mode capture syncs later, no duplicates |
| **M4** | Shape it | Lane editor Simple (date / project / priority / label / field / ready) ⇄ Text, last valid query kept; view settings (cascade, density, view as text); presets (Deadlines, Ready, per project); recipes copy/paste as text; custom field defs; dependencies (quiet blocked marker + "Ready" filter, never hidden); manual order per scope; grouping (maybe) | Build your own board from scratch without docs; paste a recipe from text |
| **M5** | Mobile, full (PWA) | Lane view with swipe between lanes + labelled swipe-to-move + Move command; task detail; touch drag | Daily use on phone for a week |
| **M6** | Reach | Email-in via intake Worker; scoped API tokens + REST (`/api/v1/tasks`, `/views/:id/lanes`); `dolist` CLI | `dolist add "Call mum by fri !2"`; mail lands in Inbox |
| — | Later: native | Spike B, then Expo app (widgets, App Intents, lock screen) + Tauri capture window, per the native rows in §1/§4 | Separate go-ahead |
| — | Later gate | Webhooks (allowlisted destinations only), plugins (own threat model) | Separate design review |

**Ordering logic**: risks first (M0 spikes), real data first (corpus in M0, import in M1), smallest daily-usable loop next (M1), then multi-device (M2) and capture everywhere (M3) before customization depth (M4).
**Parallel tracks**: spikes A/C concurrent. Native waits until the PWA proves the core.

---

## 4. Security contract (M2 onward)

| Credential | Can | Cannot | Stored |
|---|---|---|---|
| **Owner session** (web) | Everything, pair devices, mint tokens, import | — | Host-only `Secure HttpOnly SameSite=Strict` cookie; Origin/CSRF checks incl. WS upgrade |
| **Device** (mobile, desktop) | Sync read/write | Pair, mint, import | iOS Keychain (app-private), Android Keystore via SecureStore, excluded from backup |
| **API** (CLI) | Scoped REST (`tasks:read`, `tasks:write`) | Sync socket (TinyBase authorizes the whole store) | Shown once; hash in D1 |
| **Email alias** | Append to Inbox | Anything else | Hash in D1; rotatable; rate-limited |

- **Accounts** (2026-11-25, replaces enrollment/pairing/recovery codes): open sign-up. Sign in with a **passkey** or an **email link** (the mail also carries a code for the installed app, which can't open links). See §4.1.
- **Sync authz**: DO id derived server-side from the authenticated owner. TinyBase `authorize` on connect + messages; message/storage size bounds; revoke → Worker tells DO → DO closes matching sockets.
- **Widgets hold no server credentials.** Shared storage = bounded snapshot + allowlisted outbox ops only. Mutating Android intents are non-exported.
- **Outbox**: SQLite in the App Group container (WAL, transactional), one row per op with op id; app applies op + records op id in one store transaction, then deletes the row. Ops are occurrence-specific ("complete task X occurrence D"), never toggles. Sync runs when the app or an App Intent runs; otherwise next foreground ("Will sync when Dolist opens").
- **Todoist import**: owner-only, fixed `api.todoist.com`, `redirect: "error"`, no logging of token-bearing requests/errors, nothing persisted, token never stored.
- **Email**: intake Worker validates envelope recipient, rejects oversize before MIME parse, text only, service binding exposes append-only `capture()`.
- **Web**: strict CSP; imported/email content rendered as text; service worker never caches `/api` or `/sync`.
- **Desktop**: capture-only UI, enumerated Tauri capabilities, no remote IPC, credential in OS keychain.

### 4.1 M2 design (2026-11-25)

Many accounts per deployment (was: single owner with codes, replaced 2026-11-25). Everything server-side lives in two SQLite Durable Objects, so deploy needs no D1 (deviation from §1, see `.notes/HUMAN.md`).

| Piece | Shape |
|---|---|
| `Auth` DO (one, name `auth:default`) | Tables `users` (id, email unique nullable), `sessions` (user, token hash, label, created, last_seen, revoked), `passkeys` (credential id, user, public key, counter, transports), `email_links` (token hash, code hash, email, attach_to, expires, attempts), `challenges` (WebAuthn, 5 min, single use), `failures`. Called via DO RPC. Fine to ~10⁴ users; shard by user id beyond |
| `Sync` DO (one per user id) | `WsServerDurableObject` subclass, fragmented SQLite persister. `authorize()` takes the session id the Worker put in an internal header (hub mode) and refuses revoked ids (stored fence, so a late upgrade can't slip in). `revoke( session_id )` stores the fence, closes that session's sockets (4401). `snapshot()` → Dolist export JSON. 256 KB fragments both ways; messages > 1 MB close the socket |
| Worker (Hono) | `run_worker_first` for `/api/*`, `/sync`; assets otherwise. Origin check on every non-GET and WS upgrade |
| Sign-in page | `/signin`: "Sign in with a passkey" (discoverable, no email typed), "Email me a link", "Create an account with a passkey". Email links also sign up. After an email sign-in, offer a passkey once. Local-first: no account needed to use the app |
| Email link | `POST /api/email-link` → 256-bit token (link `ORIGIN/signin?token=`, the SPA POSTs it, so mail scanners' GETs can't burn it) + 40-bit code, 15 min, single use. Code dies after 5 wrong tries. ≤ 5 mails/hour per inbox, ≤ 20 per source. Unknown email = new account. Signed in, it adds an email instead, usable only by that same account. Sent via Cloudflare Email Service (`send_email` binding `EMAIL`, from `EMAIL_FROM`) |
| Passkeys | SimpleWebAuthn 13. RP = `ORIGIN` var (never the request URL: wrangler dev rewrites it). Resident key required, UV preferred, attestation none. Signed out, registration creates the account (no email). Removing the last way in (no email, one passkey) is refused |
| Throttle | ≥ 20 failures / 10 min per source IP → 429 (global cap 2000). Sessions: 256-bit token in cookie (`__Host-` + `Secure` on https, plain on http localhost), SHA-256 at rest |
| Cookie | `HttpOnly; SameSite=Strict; Path=/`, 400 days |
| Clock | `GET /api/session` returns server `now`; client `get_now = Date.now() + offset` (RTT/2 corrected), offset persisted for offline starts, recalibrated on every connect. **Skew guard off** (`maxClockSkewSeconds: Infinity`, client + server): with it, a device that ever stamped ahead has all later edits silently dropped by peers; without it they converge and a skewed clock can at worst win a conflict |
| Client sync | Every tab holds its own socket (no leader: a frozen background tab must never stall the active one); BroadcastChannel mirrors tabs. New WebSocket + `createWsSynchronizer` per connection, backoff 1 → 30 s. `offline` detaches the socket at once (close handshakes hang), `online` reconnects, resume after ≥ 60 s hidden reconnects (sleep kills sockets silently). "Synced" only after an exchange with no TinyBase error (timeouts surface only via `onIgnoredError`; any error closes + retries). Close 4401 or session gone → "Signed out", stop. Local data stays |
| Backups | Cron `17 3 * * *` → `Sync.take_snapshot()` → chunked rows in the Sync DO's SQLite (deviation: deploy token has no R2 access; DO storage is replicated, and the point is undoing bad edits), keep 30. Settings lists them; Download → existing Import = restore: rows in the backup return as they were, newer rows stay. Known limit: plain JSON drops TinyBase deletion stamps, so restoring into an empty server can let a stale device re-add rows deleted with `delRow` (e.g. undone completions) |
| First sync | Plain WS (real data ≈ 800 tasks). Gzipped HTTP snapshot bootstrap deferred until a 10k account needs it |
| e2e | `wrangler dev --var ORIGIN:http://localhost:8787 --var E2E:1`; with `E2E` set, a `dolist_tenant` cookie names the Auth DO so parallel tests get isolated deployments, and mail goes to an outbox (`GET /api/e2e/outbox`) instead of being sent. Passkeys via Chromium's CDP virtual authenticator. A unit test fails if any wrangler config or workflow mentions E2E. (Host can't gate it: wrangler dev rewrites URLs to the route host) |

---

## 5. Budgets (measured, not assumed)

| Metric | Budget |
|---|---|
| Phone: widget / intent tap → keyboard focused (cold) | ≤ 1.5 s |
| Submit → durable local ack | ≤ 100 ms |
| Desktop: hotkey → focused input | ≤ 200 ms (window kept warm) |
| Web: cold load with 10k tasks → interactive board | ≤ 1.5 s, mid laptop |
| Board interaction (drag preview, typing) with 10k tasks | 60 fps: virtualized lanes, cached compiled predicates, incremental lane membership |
| Capture survives kill right after ack | 100% |

Fixtures: generated 10k-task set + your real import.

---

## 6. Testing, CI, delivery

| Layer | How |
|---|---|
| core | Vitest: corpus, date/DST/recurrence tables, filters, recipes, move, migrations |
| web | Playwright (Chromium + WebKit) against real `wrangler dev` (Worker + DO + D1). Keyboard-only flows. Offline, multi-tab, PWA upgrade with drafts |
| sync | Convergence, process death, old client after migration |
| mobile | Real devices on LAN (adb; pymobiledevice3 + WDA); Expo web for fast UI loops |
| CI | Actions pinned to **commit SHAs**; `npm ci` from lockfile; least-privilege `permissions`; PR jobs get **no secrets**; build once, reuse artifacts; jobs filtered by affected workspace; web never waits on iOS; native builds cached by fingerprint |
| previews | **Not** `wrangler versions upload` (unavailable with DOs, shares prod data). PRs → isolated `dolist-preview` Worker with its own D1, DO namespace and secrets, trusted branches only |
| prod | `main` → `dolist` Worker; D1 migrations before deploy; `min_client` bump when needed |

---

## 7. Decisions (answered 2026-11-24)

| # | Question | Decision |
|---|---|---|
| 1 | Horizons lane placement | **Either date, soonest wins.** Drag moves the scheduled date; a deadline sooner than the target lane pins the card (refuse + explain) |
| 2 | Todoist corpus | Personal token in `.env.local` (`TODOIST_PERSONAL_TOKEN`). Read-only; export stays in gitignored `fixtures/private/` |
| 3 | Native apps | Accounts exist, but **PWA only first**. Spike B, Expo and Tauri move to Later; M3 = PWA capture |
| 4 | Round 2 options | Recommended cards: `by fri`, `!1` + `p1` alias, `#` + accessory key, drag = earliest fitting date, deadline pin = refuse + explain, `name:value`, deps in detail, one look + compact, rolling lanes |
| 5 | Lock-screen widget | Titles (toggle in settings), when native lands |
| 6 | Webhooks + plugins | Out of committed scope until the core proves itself |
