# Gotchas

- User values calm UI: never put syntax legends/queries/toggles on the main surface; hide behind one quiet control.
- Mobile tap cost matters: avoid symbols beyond the iOS 123 layer (`# { } % *` are deep on iOS).
- New review round → new db collection (feedbackN) so old marks don't mix.
- Prototype popovers: handlers that re-render the pop must survive the document "click outside" listener (detached targets) and blur-on-remove re-entrancy. Verify with puppeteer-core + /usr/bin/google-chrome (playwright module absent); install puppeteer-core in scratchpad.
- Deploys: only via GH Actions (push to main). Local remote is SSH but no key in container → push with `gh auth setup-git` + https URL. Site currently = design prototype wrapped by scripts/build.mjs.
