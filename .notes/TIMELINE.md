# Timeline

- 2026-11-23 — Phase: research/design only, no implementation. Wrote docs/RESEARCH_PLAN.md + design/prototype.html (interactive concept). Working name "Sift". Lanes default to rolling windows (today/7d/30d/90d) w/ cascade; calendar periods (week/month/quarter) also supported in grammar.
- 2026-11-23 — Round 1 marks read (artifact db `feedback`). Renamed Sift → Dolist. Round 2 published (v2): calm board (queries hidden in lane editor, cascade moved to view settings), mobile-cost grammar (`by fri` deadline, `!1` prio), easy/possible ladder, 9 option sets. Round 2 marks go to db collection `feedback2`.
- 2026-11-23 realitycheck: browser e2e of round 2 found lane-editor tab switch broken + remove() re-entrancy; fixed, republished.
- 2026-11-23 phoneafriend (codex, Jobs+DHH): fixed parser day/month prefix bug + cascade-off drag; rest logged as round 3 inputs.
- 2026-11-24 Cloudflare Worker `dolist` (static assets) + GH Actions deploy workflow; custom domain dolist.gratis.sh attached on first deploy.
- 2026-11-24 Implementation plan v2 (docs/IMPLEMENTATION_PLAN.md) after 5-persona codex review; M0 = foundation + 3 spikes, replaces brainstorm page on prod.
- 2026-11-24: §7 answered — either-date soonest wins; PWA only first (native → Later); Todoist token in .env.local
- 2026-11-24: M0 shell — npm workspaces (apps/web Vite React PWA, packages/core), airier lint, Vitest, Playwright vs wrangler dev, CI check job + SHA-pinned actions, deploy ships tested artifact. Prototype no longer deployed.
- 2026-11-24: Spike A → TinyBase go (≥10.1) with own incremental IDB persister + server-time clock. Spike C corpus done.
