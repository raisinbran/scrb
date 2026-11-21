### A-861 — 2026-11-19 — W10 — initial capture provenance summary queried nonexistent fields

- **Status / attribution:** Confirmed reporting-query error; no source or package files changed by the query.
- **What failed:** The first summary read `sourceCommit` and a top-level `capture` property, while the actual schema names the build identity `repositoryHeadAtBuild` under `sources.capture`.
- **Impact:** That diagnostic printed blank values and did not establish a source identity. It was not used to bypass package verification.
- **Correction / remaining risk:** Read the actual schema, confirmed the repository head is the pinned `eb2d9395` and the generated source, Opus, binary and manifest hashes. The independent package verifier still fails because it requires `sources.capture.sourceCommit`, which the generated schema does not supply. Low.
