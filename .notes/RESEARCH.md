
## Todoist corpus (spike C, 2026-11-24)
Export: `node --env-file=.env.local scripts/todoist-export.mjs` → `fixtures/private/` (gitignored; STATS.md there).
Grammar gaps to cover in M1 parser: mask URLs/markdown links/emails before parsing; quoted `#"Two words"`/`@"x y"` + `Parent/Child` projects; `!` priority only as whole `!1`–`!4` token; API priority 4 = UI p1; import accepts `D Mon`, `D Mon YYYY`, ISO, 24h, `every <n>` (day of month), `yearly`; datetime lives in `due.date` with `T`. Account has no deadlines/durations/`every!`, so hand-write those cases.
