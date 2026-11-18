### A-772 — 2026-11-18 — ChatGPT Chat / cloud GitHub — initial offline-manual test assertions needed correction

- **Status / attribution:** Confirmed authoring mistakes, corrected before CI; not an application defect.
- **What failed:** The initial new Help tests over-escaped the third-party license regex, used an unscoped role=status query that could collide with asynchronous About/license status elements, and looked for an Overview-only privacy phrase while section 1 was selected. The new Markdown renderer also assumed a RegExpMatchArray match index was always present rather than explicitly handling a missing index.
- **Agent-controlled cause:** Draft tests and TypeScript without verifying selector scope, selected-section text and token-index typing against the actual code.
- **Impact:** Additional scoped correction commits on the task branch. No application run, user data, packaged artifact or acceptance evidence was affected. Local focused Vitest execution is unavailable in this cloud container because GitHub DNS and dependency fetching are unavailable; Windows/macOS PR CI is the verification source.
- **Evidence:** Branch `rosmont/v1-offline-manual`, focused follow-up commits `415fb973`, `8749c7f1`, `44cc1421` and subsequent CI.
- **Correction / prevention:** Scoped the search status with an accessible name, corrected the license regex and privacy assertion, and guarded the token index. Await exact-head CI before describing tests as passed.
- **Owner approval:** No merge or long physical test authorized; standard PR and CI are within assignment scope.
