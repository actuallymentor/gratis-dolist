# For the human

- §7 decisions answered 2026-11-24 (see plan §7).
- Prod still serves the old prototype: M0+M1(+M2) commits are local until you say "push".
- **M2 started autonomously (yolo)** after repeated stall checks; no explicit go-ahead was given.
- **Deviation:** auth lives in an `Auth` Durable Object (SQLite), not D1 → no D1 to provision, single-owner deploy. Revisit if multi-user ever matters.
- **Before M2 can go live:** set the `ENROLLMENT_CODE` Worker secret (one-time, you pick it) and make sure an R2 bucket for snapshots exists/provisions. Needs your OK to touch Cloudflare.

## 2026-11-25 Deploy blocked: CF token lacks R2
- main pushed (3eeccbd). Deploy job fails: CLOUDFLARE_API_TOKEN gets `Authentication error [code: 10000]` on R2 bucket info/create.
- Fix: add "Workers R2 Storage: Edit" to the token, OR create bucket `dolist-snapshots` in the dashboard (preCommands then skip create — but `r2 bucket info` still needs R2 read; token needs at least R2 read either way, and deploy binding needs it too).
- ENROLLMENT_CODE: GH secret set; local copy in .env.local as DOLIST_ENROLLMENT_CODE. Uploaded by the deploy step.
- RESOLVED same day: backups moved from R2 into the Sync DO's SQLite (chunked, keep 30), R2 binding dropped, so the deploy no longer needs R2 permission. Revisit R2 only if off-DO copies are wanted.

## 2026-11-25 Accounts (passkey + email link)
- Open sign-up; app stays usable without an account (local-first). Decision: not gating the app behind login.
- Email needs Cloudflare Email Service: onboard gratis.sh (dashboard → Compute → Email Service → Email Sending → Onboard Domain). Sending to arbitrary inboxes needs Workers Paid. Until then email links 503; passkeys work.
- ENROLLMENT_CODE GH secret + DOLIST_ENROLLMENT_CODE in .env.local are now unused (safe to delete).
- Email link also carries a code: an installed iOS PWA can't receive links (they open Safari).

## 2026-11-25 — Prod email sending blocked
- Accounts deployed (passkey sign-up/sign-in verified in prod). Email links fail: send() → `E_SENDER_DOMAIN_NOT_CONFIGURED`.
- gratis.sh has no `cf-bounce` MX/SPF or `_dmarc` records ⇒ not onboarded for Email *Sending* (Routing ≠ Sending). Fix: dash → Compute → Email Service → Email Sending → Onboard Domain → gratis.sh, same account as the Worker.
- Prod smoke left 3 throwaway passkey-only accounts (no email, no tasks).
- 2026-11-25 later: RESOLVED — gratis.sh onboarded for Email Sending (cf-bounce MX/SPF + DMARC live); prod /api/email-link → 200. Inbox delivery not verified by agent (no inbox access).

## 2026-11-25 — Shorthand calls made autonomously
- Bare `at 1`–`at 6` = afternoon (13–18h); `at 7`+ and leading zero (`at 05`) as written. Flip if you think in 24h only.
- Bare `at N` only counts at the end or touching other shorthand (`Meet at 5 shops` stays text).
- `tom` = tomorrow, but capitalised `Tom` is a name (`Call Tom at 5` → only the time parses).
- 2026-11-26 Projects: new `#name` still needs Enter twice (create offer) — typo guard from the original spec. No rename/delete/reorder UI for projects yet. Sidebar shows the full tree twice (Projects + Horizons), as asked; may get long with many projects (no collapse yet).
- 2026-11-26 UX batch decisions: landing page is Horizons (Today removed). Triage toggles read as "include tasks that have X"; the request listed "has project" twice, so it's Date / Deadline / Project. /capture keeps its inline box (PWA start URL + share target). Search: `next week` = whole week, `by X` = deadline on or before X, single dates match scheduled OR deadline. `by fri at 5` now sets the deadline time (before: scheduled time).
- 2026-11-27: Deleting a project deletes its subprojects too (Undo restores all); their tasks become unfiled (show in Triage) rather than deleted. Folds are per device (localStorage), not synced. Sidebar folds for Horizons and Projects are independent.
- 2026-11-27 sidebar/keys: layout + shortcuts are per device (localStorage), not synced. Everything is hideable, incl. Settings and Sidebar settings; Settings → Sidebar → Customize always reopens the modal (and /settings is reachable by URL). Labels is desktop-only in the tab bar (phones: Settings → Labels). Esc/Enter/Tab/Space can't be rebound. Chords (Ctrl/Alt/⌘) fire even while typing in a field; single keys don't.
