### A-404 — 2026-11-14 — Claude Code / Sonnet 5.5 / Windows PC Regiurn — two multi-line file writes failed in the shell and had to be redone
- **Status / attribution:** Confirmed agent error (tool use); no product defect.
- **What failed:** Two large source files were written through bash here-documents containing apostrophes and backslash sequences. The shell rejected both commands (`unexpected EOF`), so nothing was written, and the files were then created with the Write tool instead.
- **Impact:** Two wasted tool calls and a short delay in the outline local-test harness task. No wrong file reached the repo.
- **Source evidence:** The two failed shell calls in the session transcript, each ending with exit code 2 and no output files.
- **Correction / remaining risk:** Source files are written with the Write tool, not shell here-documents. Negligible risk.
