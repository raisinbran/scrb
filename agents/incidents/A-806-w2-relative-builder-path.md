### A-806 — 2026-11-18 — relative builder CLI path changed meaning

- **Status / attribution:** Confirmed agent implementation defect found in independent review; no observed production impact.
- **What failed:** The packaging script checked an optional caller-supplied relative `BuilderCli` before changing to the desktop directory, then invoked it after the directory change.
- **Impact:** A relative path valid from the caller's directory could fail or resolve to a different file. The default resolver returns an absolute path, so ordinary invocation was unaffected.
- **Correction / remaining risk:** Normalize a supplied path with `GetFullPath` before validation and invocation, and add a focused assertion. Awaiting checks and exact-head CI. Low.
