### A-938 — 2026-11-20 — W10 — AMI research runner did not contain caller-derived paths

- **Status / attribution:** Confirmed implementation defect found by independent review; no traversal input was run and no unrelated file was deleted.
- **What failed:** The runner accepted an unchecked meeting string in source/WAV/work paths and used a deterministic scratch path that `runFinalPass` removes recursively.
- **Impact:** A malformed meeting argument or preexisting scratch-path collision could escape the AMI input directory or cause cleanup to remove caller data.
- **Correction / remaining risk:** Restrict meeting IDs to AMI's `AA9999a` form, generate a unique WAV name, and create a unique owned scratch directory with `mkdtemp`. Verify invalid IDs fail before accessing assets. Low after the checks pass.

