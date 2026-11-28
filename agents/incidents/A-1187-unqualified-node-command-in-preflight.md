### A-1187 — 2026-11-18 — Codex / MacBook Air M5 — preflight metadata command used Node before adding the configured path
- **Agent:** Codex (Mac)

- **Status / attribution:** Confirmed agent setup error; no application defect.
- **What failed:** I invoked `node` from the shell's default PATH while inspecting package scripts. The shell returned `command not found`; the repository instructions specify the configured Node installation under the owner's home directory.
- **Impact:** One metadata inspection command did not run. No application process or file was affected by that failed command.
- **Correction / remaining risk:** Re-ran the read with `/Users/brandonchen/.local/share/scrb-node/current/bin/node` only for version verification; subsequent source inspection used `rg`. Low.
