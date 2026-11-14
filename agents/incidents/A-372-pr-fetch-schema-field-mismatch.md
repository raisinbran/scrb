### A-372 — 2026-11-14 — local coding session — PR fetch used an unsupported repository field

- **Status / attribution:** Confirmed session error; no application defect.
- **What failed:** One PR fetch request was rejected because I supplied `repository_full_name` where the connector requires `repo_full_name`.
- **Impact:** One failed read request and a short delay. No GitHub or repository state changed.
- **Correction / remaining risk:** Repeated the read with the required field and verified the PR head and changed filenames. Low.
