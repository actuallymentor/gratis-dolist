# For the human

- §7 decisions answered 2026-11-24 (see plan §7).
- Prod still serves the old prototype: M0+M1(+M2) commits are local until you say "push".
- **M2 started autonomously (yolo)** after repeated stall checks; no explicit go-ahead was given.
- **Deviation:** auth lives in an `Auth` Durable Object (SQLite), not D1 → no D1 to provision, single-owner deploy. Revisit if multi-user ever matters.
- **Before M2 can go live:** set the `ENROLLMENT_CODE` Worker secret (one-time, you pick it) and make sure an R2 bucket for snapshots exists/provisions. Needs your OK to touch Cloudflare.
