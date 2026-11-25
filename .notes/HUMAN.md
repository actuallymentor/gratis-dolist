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
