### A-860 — 2026-11-19 — W10 — capture manifest emission hit Git ownership guard under approved build context

- **Status / attribution:** Confirmed build-command environment mismatch; no source or global Git/ACL state changed.
- **What failed:** The capture C++ compile completed, but `build.cmd`'s manifest generator could not read the pinned Opus clone because the approved elevated command context had a different Windows identity from the worktree that created the clone. Git rejected `rev-parse` for that one path.
- **Impact:** The first `build.cmd` invocation exited before emitting `capture-build-manifest.json`; its compiled helper is not yet stageable. No capture executable was run.
- **Correction / remaining risk:** Re-run the build with a process-only Git `safe.directory` entry for that exact verified Opus clone. Do not change global Git settings, file ACLs, or sandbox policy. Low.
