### A-601 — 2026-11-16 — Codex / Mac desktop — evidence patch used the wrong path

- **Status / attribution:** Confirmed agent path-selection mistake; no data loss.
- **What failed:** An `apply_patch` request targeted the evidence note as though it lived inside the worktree. The actual file is in `/private/tmp`, so the update failed with a file-not-found response.
- **Agent-controlled cause:** I inferred the evidence note's directory from its basename instead of checking the path previously used to read it.
- **Impact:** One patch attempt failed; the note was then updated at its correct `/private/tmp/scrb-transcript-jump-evidence-20261116.md` path.
- **Evidence:** Tool error and successful subsequent patch.
- **Correction / prevention:** Preserve and reuse the full path returned by the earlier read.
