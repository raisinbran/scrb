### A-523 — 2026-11-15 — Codex / Mac local — llama.cpp MIT notice was not bundled

- **Status / attribution:** Confirmed implementation gap found in independent review; corrected in this branch.
- **What failed:** The first draft recorded the pinned llama.cpp MIT license in the repository but did not copy the notice into the packaged Scribe.app.
- **Agent-controlled cause:** I treated the repository notice as sufficient and did not inspect the final app resources for the required license text.
- **Correction / remaining risk:** The package script now copies the standalone MIT notice under `Contents/Resources/bin/licenses/`; a rebuilt app contains a byte-identical notice, and the server launch and signing checks passed. Low.
