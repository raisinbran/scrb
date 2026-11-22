### A-1071 — 2026-11-22 — Codex Desktop / Windows — benign Notepad launch restored existing user document

- **Status / attribution:** Confirmed agent-caused setup mistake; no Scribe or application defect.
- **What failed:** To begin the authorized benign GUI-control check, launched the Notepad app inventory entry expecting a blank test window. Windows instead restored an existing unsaved user document. Only its window title was visible; its contents were not read.
- **Impact:** The unrelated document became visible in the desktop inventory. It was not edited, saved, closed, or otherwise changed. The GUI input test was stopped; result is `VISIBLE_ONLY`.
- **Agent-controlled cause:** Did not first establish that launching Notepad would not restore an existing user document. App inventory's earlier `isRunning=false` state was insufficient to establish that no user document would reopen.
- **Correction / remaining risk:** Stopped all Notepad interaction and left the existing document untouched. Any future benign GUI test must select a demonstrably blank/isolated app window before sending input. Low; no document content was exposed beyond its title and no file was changed.
- **Incident ID correction:** Later PR #432 event renumbered from A-1044 to A-1071. Earlier PR #415 A-1044 is a distinct prior event and was not changed; the observed Notepad event and its historical facts are retained.
