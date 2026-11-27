# Changelog

## 2026-11-27

### Added
- project CRUD: New project form on Projects (`Work/Clients` ok); Edit on a project page renames, moves (never into its own subtree), deletes with Undo
- sidebar trees fold: chevron per group (Horizons, Projects) and per parent project, remembered per device

### Changed
- Triage toggles now narrow: No date / No deadline / No project (default: No date + No deadline); URL keys `no_date`, `no_deadline`, `no_project`
- task detail: unfiled option reads "No project" (was "Inbox")

## 2026-11-26

### Added
- Triage (was Inbox): filter view with Has date / Has deadline / Has project toggles (default: undated), kept in the URL
- sidebar / tab-bar Add task opens quick add (the only add surface besides `n` and /capture)
- search reads shorthand: `#work by next week`, `tomorrow p2`, `@sensitive p1 p2 p4`, `next week`
- deadline times: `by tom 16`, `by fri at 5pm`; shown on cards, editable in the detail
- nested projects: `#Work/Clients` creates/finds each level; project pages + Projects index
- sidebar lists every project under Projects (tasks) and Horizons (its own board); phones get a Projects tab
- `n` on a project page files the task into that project
- Horizons: Someday lane (undated or beyond a quarter) replaces “Outside this view”
- welcome screen on load when signed out: sign in or continue without login

### Changed
- removed the Today view (Horizons' Today lane covers it); app opens on Horizons; /today, /inbox redirect
- inline add bars removed from list pages
- Horizons uses the full width; list pages wider (60rem)

### Fixed
- deadline times leave amounts alone (`by fri 3.50`, `at 5 shops`); an invalid hour keeps the deadline
- search: `at 9`, `every …` and deadline cutoff times filter for real; `in 1 week` is one day; weekend correct on Sundays
- deadline date + time fit phone-width task view; /inbox and /today links keep `?task=`
- board scrolls inside itself instead of widening the page; a missing project's board is empty, not everything
- a later #project token no longer keeps the earlier project's id
- primary buttons readable in dark mode
- welcome screen blocks keys to the app behind it; never appears mid-session

## 2026-11-25

### Added
- `n` anywhere opens quick add in a centered modal (own draft)
- keys: `j`/`k` select task, `Enter` opens it, `e` completes it
- shorthand: `tom`, bare hours `at 18` / `at 09` / `at 1500` / `at 5` (= 17:00)
- edited titles parse shorthand (highlighted while typing, stripped on save)

### Changed
- task detail is a centered modal (bottom sheet on phones)
- quick-add time chip shows the resolved time
- modals trap Tab and return focus (keeps the j/k selection)

### Fixed
- title edits keep quoted text protected; `at 5.50` stays an amount
- unknown #name next to a time no longer clears the time; added repeats keep the task's date
