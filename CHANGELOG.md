# Changelog

## 2026-11-25

### Added
- `n` anywhere opens quick add in a centered modal (own draft)
- keys: `j`/`k` select task, `Enter` opens it, `e` completes it
- shorthand: `tom`, bare hours `at 18` / `at 09` / `at 5` (= 17:00)
- edited titles parse shorthand (highlighted while typing, stripped on save)

### Changed
- task detail is a centered modal (bottom sheet on phones)
- quick-add time chip shows the resolved time
- modals trap Tab and return focus (keeps the j/k selection)

### Fixed
- title edits keep quoted text protected; `at 5.50` stays an amount
- unknown #name next to a time no longer clears the time; added repeats keep the task's date
