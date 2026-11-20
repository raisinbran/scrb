### A-857 — 2026-11-19 — W10 — initial model-hash diagnostic used an invalid path and comparison

- **Status / attribution:** Confirmed diagnostic-script error; no model or repository files changed.
- **What failed:** The first manual PowerShell check joined the assets root to a relative path that already began with `models`, creating a duplicate path segment. Its segmentation-archive output also checked whether the expected digest appeared in the source text instead of comparing the actual archive digest.
- **Impact:** The first four model lookups failed and the initial archive comparison output was invalid; none of those values was used as verification evidence.
- **Correction / remaining risk:** A corrected check compared the actual file sizes and SHA-256 values with the pinned manifest and archive digest. All four model files and the segmentation archive matched. Low.
