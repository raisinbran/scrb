### A-352 — 2026-11-13 — Owner instruction wording — generated package output deletion scope

- **Status / attribution:** Owner wording ambiguity, not an agent error.
- **What was unclear:** The first prompt said “Do not delete files” without excluding the generated `apps\desktop\release` directory that `package-win.ps1` removes and recreates.
- **Impact:** The initial package-script invocation was blocked by automatic review before execution; packaging waited for a clear scope.
- **Clarification / remaining risk:** The owner explicitly authorized deleting only `apps\desktop\release`, with no deletions elsewhere. The package script then completed after one retry. No source, recordings, gate evidence, `agents`, `docs`, or other evidence files were deleted. Low.
