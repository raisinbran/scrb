### A-866 — 2026-11-19 — W10 — recursive whisper source listing returned an oversized result

- **Status / attribution:** Confirmed overbroad diagnostic output during final package preparation; no repository state changed.
- **What failed:** A recursive file listing under the known `whisper.cpp` input directory traversed the full third-party source tree and emitted thousands of entries when only top-level input locations were needed.
- **Impact:** Excess output and avoidable usage; no source, dependency, or build files were modified.
- **Correction / remaining risk:** Stopped the recursive listing and used bounded, explicit known paths and filename filters. Low.
- **Publication:** This incident and its usage row are included in the final-build accounting draft PR branch; not on `main` pending review.
