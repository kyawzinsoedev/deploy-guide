# Validation record

Application QA updated on 2026-10-29. The guide's official-source baseline remains dated 2026-10-28; Vite static deployment, Next.js static export, and Laravel deployment/encryption were revisited for this revision.

- Next.js 16.4.3 production build and strict TypeScript compilation: passed. `out/` contains the static site.
- Automated regression suite: 35 tests passed, none skipped. Covers all six stacks with npm/pnpm and www enabled/disabled, required teaching fields, production routing, private process configuration, input rejection, shell quoting, configuration-specific progress keys, and complete Markdown output. New regression cases cover 5/6/7-stage paths, local-only static builds, conditional Laravel actions, task context in downloads, and refusing existing accounts/paths before first-setup mutations.
- Generated Bash snippets: parsed with `bash -n`; no deployment command was executed. Covers repository and upload variants for each stack.
- Browser: landing page, wizard stages, rejected shell-like domain input, personalized review, generated workspace, command/explanation/expected tabs, arrow-key tab selection, copy feedback, search across all six guides, symptom search and troubleshooting disclosures checked.
- Browser storage: the revised guide restores the current stage and completed count after reload; cancel-reset and confirmed reset checked. Old thirteen-step progress is deliberately isolated from the revised checklist.
- Themes: the initial build's four themes were visually inspected. This revision was rechecked in Paper Light and Midnight Blue. Reading text, new task disclosures, optional sections, and advanced settings use the theme variables.
- Responsive checks in the initial build: mobile 390×844, tablet 820×1180 and desktop 1280×900, with no document-level horizontal overflow in inspected views. The revised desktop layout was visually inspected. The final mobile recheck was interrupted by the browser connection becoming unavailable, so it is not recorded as passed for this revision.
- Downloads: the initial Markdown browser download was found on disk. This revision's Markdown and Nginx controls were clicked and displayed feedback, but new files could not be confirmed in Downloads before the browser connection failed. Their generated contents, escaping, optional conditions, and missing-placeholder checks passed the regression suite. A fresh browser download check remains advisable.
- Print: the print-only document includes every task in the shorter launch path, optional-task conditions, architecture and maintenance references, and official sources regardless of the active screen tab. A physical printer or PDF print job was not exercised.

## Revision checks

The wizard now shows three primary server fields with the remaining settings under Advanced. Invalid domain input was rejected. Changing the app name updated the default project directory. A six-stage Vite guide was generated, its local build copied correctly, its saved stage restored after reload, and its reset confirmation exercised. Search for “queue” opened the Laravel PHP-FPM stage with optional work collapsed. The exported `out/` website was served with the included `npm run preview` tool, and HTML, Vite, Express, and static Next.js were generated through its wizard with the expected step counts. All six variants are covered by the regression suite. No deployment command was executed during website QA.

## Limits

Deployment instructions were checked against the linked official documentation. They were not executed on a live Ubuntu server. The website cannot inspect or verify a user's server. Provider-specific networking, project-specific builds, databases and migrations require the checks described in the guides.

The user chose **Keep it local**. Source upload and Site publication were intentionally omitted. The complete source and static export are available locally; no hosted publication is claimed.
