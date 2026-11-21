### A-954 — 2026-11-20 — Codex Desktop — Mac renderer verifier used a lint-disallowed URL global

- **Status / attribution:** Confirmed verifier-author error; caught before CI or package publication.
- **What failed:** The command-line entrypoint check referenced the browser `URL` global, which the repository ESLint configuration does not allow in Node scripts.
- **Impact:** The second standard check stopped at lint.
- **Correction / remaining risk:** Switched to Node's `fileURLToPath(import.meta.url)` and reran the full check successfully. Low.

- **Incident-ID correction (2026-11-20):** Former provisional A-891 was reassigned to A-954 because open PRs #376/#377 independently reserve A-886–A-893 for different Windows events. The original evidence remains in the PR's commit history; the underlying mistake and attribution are unchanged.
