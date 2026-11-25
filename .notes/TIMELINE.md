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
- 2026-11-24: M1 daily core integrated (core grammar/recurrence/recipes, store w/ incremental IDB, web UI). Real Todoist import via UI: 793 tasks / 2.8 s. Todo: render markdown links in titles.
- 2026-11-24: M1 review fixes (5 personas agreed): load-failure wipe, flush false-success, per-tab drafts, detail commit-on-close, todoist id refs, literal-first grammar, lane/list paging. 10k @4x: Horizons 1.33 s, Today 1.01 s. Complete→ack 366 ms @4x: measure on real hardware.
- 2026-11-25: phoneafriend (5/5 BLOCK) on M1 fixes → stale detail commit, duplicated-tab drafts, persister repair, unparsed-recur history, Horizons outside cap, legacy draft key. All fixed + regression tests.
- 2026-11-25: M2 started autonomously (yolo, after repeated stall checks). Auth in Auth DO (not D1), Sync DO hub mode, R2 nightly snapshots. Design review (5/5 REVISE) → revocation fence, per-IP throttle, no tab leader, persisted clock offset.
- 2026-11-25: M3 (PWA capture) started autonomously after another stall check: /capture start URL, shortcuts, share target, accessory row, iOS how-to in Settings.
