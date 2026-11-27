# A-1135 — 2026-11-24 — unsupported guessed About-section file path

- **Failure:** During the second independent reviews of PRs #471 and #473, the reviewer requested `apps/desktop/src/ui/screens/settings/AboutSection.tsx` at PR #473 exact head without first verifying whether the file existed. GitHub correctly returned 404 NOT_FOUND. The actual About/Credits and notices UI resides in `apps/desktop/src/ui/screens/HelpScreen.tsx`.
- **Attribution and impact:** Self-induced incorrect path guess, not a source regression, CI or app issue. One wasted read with no repository modification, workflow execution, owner host, audio or private data effect.
- **Correction:** Read the existing `HelpScreen.tsx` and its tests from exact PR head. The formal review cited the correct real source after verifying it. No retry of the incorrect path was performed.
- **Prevention:** Search repository file names or use known indexed source paths before a file-specific fetch; avoid guessing component file names.
- **Incident ID coordination:** A-1132 is in draft PR #471, A-1133 in draft PR #472, and A-1134 in draft PR #474; A-1135 is allocated for this distinct error, subject to collision check before merge.
