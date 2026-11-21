### A-876 — 2026-11-19 — Mac A2 supplemental provenance comparison used mismatched representations

- **Status / attribution:** Confirmed read-only audit-helper errors; no package files were changed by the checks.
- **What failed:** The first supplemental dependency comparison compared original `installName` values with final hash-suffixed staged target names, producing 37 false mismatches. Its FFmpeg hash comparison also omitted the manifest's output trimming. A subsequent inline correction had a Python syntax error and exited before reading the bundle.
- **Impact:** One incorrect discrepancy report and one no-op syntax failure; packaging output was unaffected.
- **Correction / remaining risk:** The comparison was corrected to match actual `otool -L` dependency basenames against manifest target basenames and to hash trimmed FFmpeg output. All 90 dependency links and the FFmpeg probe hash then matched the manifest. Low.
