### A-1167 — 2026-11-25 — Claude Code — legacy usage log printed in full during punctuation diagnosis

- **Agent:** Claude
- **Attribution:** Confirmed self-induced.
- **Observed:** `cat` of the first `.md` file in a `git show --name-only` listing printed the whole frozen `agents/usage-log.md` into context, against the rule not to read it in full.
- **Impact:** Wasted context only; no file changed.
- **Correction:** Named the handoff file explicitly and read it alone; the usage row is a new file.
- **Prevention:** Check which file a grep selected before printing it.
- **Second failure, same task:** a hinted `whisper-cli` call failed with its output sent to `/dev/null` (a prompt argument built without quoting), so the error was invisible; I reran it with output visible. Cost: one wasted short decode and one extra call.
