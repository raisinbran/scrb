### A-818 — 2026-11-18 — relative builder CLI path changed meaning

- **Status / attribution:** Confirmed agent implementation defect found in independent review; no observed production impact.
- **What failed:** The packaging script checked an optional caller-supplied relative `BuilderCli` before changing to the desktop directory, then invoked it after the directory change.
- **Impact:** A relative path valid from the caller's directory could fail or resolve to a different file. The default resolver returns an absolute path, so ordinary invocation was unaffected.
- **Correction / remaining risk:** Normalized a supplied path with `GetFullPath` before validation and invocation, and added a focused assertion. Updated exact-head CI passed on `fa2c364586d3090ba677316babe72bfd2845d253` (run 44450374154); independent re-review found no actionable findings. Low.
