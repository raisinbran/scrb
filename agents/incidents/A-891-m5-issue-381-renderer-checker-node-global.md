### A-891 — 2026-11-20 — Codex Desktop — Mac renderer verifier used a lint-disallowed URL global

- **Status / attribution:** Confirmed verifier-author error; caught before CI or package publication.
- **What failed:** The command-line entrypoint check referenced the browser `URL` global, which the repository ESLint configuration does not allow in Node scripts.
- **Impact:** The second standard check stopped at lint.
- **Correction / remaining risk:** Switched to Node's `fileURLToPath(import.meta.url)` and reran the full check successfully. Low.
