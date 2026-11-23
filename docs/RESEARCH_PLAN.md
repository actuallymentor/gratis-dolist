# Sift — research plan

Working name: **Sift** (tasks get sifted into lanes by rules you write).
Status: pre-design. No implementation yet. Prototype: `design/prototype.html`.

---

## Thesis

Todoist nails *capture* (shorthand) and *retrieval* (filters). It stops short of letting retrieval drive *layout*.
Sift's core move: **a view is a saved recipe** = `source → lanes (each a filter) → sort → group → render`.
Board, list, calendar, widget are just renderers of the same recipe. Everything user-facing is data you can edit, copy, share.

## Principles (draft, to argue about)

| # | Principle | Implication |
|---|---|---|
| 1 | Capture < 2s, anywhere | Widgets, global hotkey, share sheet, email-in, CLI. Inbox is the default sink. |
| 2 | Text is the API | Quick-add syntax == filter syntax == recipe syntax. One grammar to learn. |
| 3 | Views are data | Recipes are plain JSON/text: diffable, copyable, shareable, versioned. |
| 4 | Lanes cascade | Optional "first match wins" so Today ⊂ Week ⊂ Month don't duplicate. |
| 5 | Two dates, not one | `scheduled` (when I'll do it) ≠ `deadline` (when it's due). Filters address both. |
| 6 | Extensible by default, simple by default | Sane presets; every preset is an editable recipe, not hardcoded UI. |
| 7 | Keyboard + touch parity | Every action has a key on desktop and a gesture on mobile. |
| 8 | Local-first | Offline capture always works; sync is a background concern. |

## Research questions

**Model**
- Q1 Scheduled vs deadline vs time-of-day vs duration: which are first-class fields?
- Q2 Projects vs labels vs custom fields: does "project" stay special or become just a field?
- Q3 Custom fields (energy, context, estimate): typed schema per user? per project?

**Capture**
- Q4 Shorthand grammar: Todoist-compatible (`#`, `@`, `p1`, `{deadline}`) vs own? Conflicts (`#` in titles, emails with `@`)?
- Q5 NL date parsing: library (chrono, sherlock) vs own; locale support; ambiguity UX ("fri" = this/next).
- Q6 Mobile widget capability per OS: iOS interactive widgets (App Intents) vs Android Glance; can a widget accept text inline or must it open a sheet?

**Retrieval / views**
- Q7 Filter language: extend Todoist syntax or design one (`date:7d & p1`)? Parser + autocomplete + error UX.
- Q8 Lane semantics: overlapping vs cascading; rolling (7d) vs calendar (this week); what does dragging between filter-lanes *do* (rewrite the date to satisfy the target lane?).
- Q9 Sorting: multi-key sort, manual order inside a lane, how manual order survives re-filtering.

**Extensibility**
- Q10 Extension surface tiers: (a) recipes/templates, (b) formulas/computed fields, (c) scripts/plugins (sandboxed JS/WASM), (d) API/webhooks. Which tiers in v1?
- Q11 Sharing: recipe gallery? Import a view by pasting text?
- Q12 Safety: plugin sandboxing, permissions, perf budget.

**Platform / stack**
- Q13 Web-first + desktop + mobile: one codebase (Expo/RN + web, Tauri desktop) vs PWA + native widget shells.
- Q14 Sync: CRDT/local-first (Automerge, Yjs, Replicache/Zero, PowerSync, ElectricSQL) vs server-authoritative.
- Q15 Import from Todoist (API v1) for dogfooding day one.

## Method

| Phase | Work | Output |
|---|---|---|
| R1 Landscape | Teardown: Todoist, TickTick, Things 3, OmniFocus (perspectives!), Linear (views), Notion DBs, Amazing Marvin (strategies = extreme customization), Akiflow, Sunsama, Taskwarrior (filter/urgency model), Obsidian Tasks/Dataview (query-as-text). | Feature matrix + "steal list" |
| R2 Grammar | Survey shorthand + filter syntaxes; draft one unified grammar; test against 50 real tasks from your Todoist. | Grammar spec v0 + test corpus |
| R3 Platform | Prototype-level spikes: iOS interactive widget text capture, Android Glance widget, Tauri global hotkey, PWA share target. | Capability table per OS |
| R4 Sync/stack | Compare local-first engines on offline capture, conflict model, web+native support, self-host. | Stack recommendation |
| R5 Extensibility | Study Marvin strategies, Obsidian plugins, Raycast extensions, VS Code contribution points. | Extension tier proposal |
| R6 Validate | Dogfood clickable prototype against your real week; mark want/maybe/nope. | Prioritized v1 scope |

Phases R1–R5 parallelizable (independent agents). R6 depends on all.

## Open decisions for brainstorm

- Name.
- Todoist-syntax compatibility: strict, superset, or clean break?
- Cascade lanes on by default?
- Drag between lanes: rewrite dates or forbid?
- Plugin tier in v1 or later?
- Self-hosted sync required?
