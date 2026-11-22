### A-871 — 2026-11-19 — W10 — prior Node 22 path was unavailable in this checkout context

- **Status / attribution:** Confirmed tool-path assumption during targeted smoke-harness validation; no project state changed.
- **What failed:** I invoked the previously reported Node 22 absolute path, but that executable was not present in the current shell environment. The first focused Vitest invocation did not start.
- **Impact:** One failed test-launch command. I then ran the focused four-test file using the available system Node 26; PowerShell syntax parsing passed separately. Node 22 CI validation remains authoritative for compatibility.
- **Correction / remaining risk:** Used only the available executable for the local focused source test and did not repeat a broad environment search. Low.
- **Publication:** Local and unpublished in `agents/incidents/`; included in the W10 installer-smoke reporting PR branch.

