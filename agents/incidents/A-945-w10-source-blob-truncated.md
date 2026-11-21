### A-945 — 2026-11-20 — W10 — Source blob included truncated tool-output notice

- **Status / attribution:** Confirmed agent publication error; application source on disk remained intact.
- **What failed:** The source file exceeded the output limit used while reading it for a GitHub blob. The truncation warning was serialized as the first line of the committed TypeScript, so Prettier failed to parse it on both CI platforms.
- **Impact:** PR head `7895e16a` failed both CI jobs before completing formatting checks. No source behavior was tested on that head; no retry was issued.
- **Correction / remaining risk:** Re-read the unchanged local file as base64 bytes, verify the Git blob SHA against the local Git object hash, then publish on a new head. One legitimate CI run will verify that corrected candidate. Low.

