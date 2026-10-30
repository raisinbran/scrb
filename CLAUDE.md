# Meeting Scribe: instructions for coding agents

**Ownership rule:** UI code lives in `apps/desktop/src/ui/`, backend code lives everywhere else, and `packages/contracts/` changes only with the owner's approval.

**Work split (owner decision, 2026-10-30):** gates are approved in sequence; a phase does not start before the previous gate is approved. The Codex/Claude split in the Development Process document is a preference, not a rule: unless the owner asks for work to be split between Claude and Codex, Claude Code may build both UI and backend. The folder boundaries still apply: keep each change on one side of the line, and do not let UI code import backend modules.

## Sources

- Requirements: `dev-plan/Meeting Scribe - V1 Requirements v1.2.md`
- Plan and gates: `dev-plan/Meeting Scribe - Development Plan (v2.0).md`
- How work is done: `dev-plan/Meeting Scribe - Development Process.md`
- Screens and contract: `dev-plan/Meeting Scribe - UI Specification.md`

## Layout

| Path                                     | Contents                                                     |
| ---------------------------------------- | ------------------------------------------------------------ |
| `apps/desktop/src/main/`, `src/preload/` | Electron processes. Keep them small.                         |
| `apps/desktop/src/ui/`                   | Screens, shell, tokens, UI tests                             |
| `apps/desktop/src/ui/mocks/`             | Mock backend. Must match the contract exactly.               |
| `packages/contracts/`                    | Typed UI/backend contract. Owner-approved. |
| `packages/*`                             | Backend packages                                             |
| `docs/handoffs/`                         | Handoff notes                                                |

## Rules

- The UI reaches the backend only through `Backend` from `@scrb/contracts`. If the contract lacks something, write a handoff note in `docs/handoffs/`.
- Never weaken the Electron settings: context isolation, sandbox, no node integration, one call channel and one event channel, names allowlisted in both preload and main.
- Colors live only in `apps/desktop/src/ui/theme/tokens.css`. A test enforces this and WCAG AA contrast.
- Risky changes need a written plan the owner approves first. The Development Process lists them, including security settings and IPC.
- Comments state a needed fact the code does not. See the Development Process document.
- Pin exact dependency versions. Keep models, recordings and generated data out of git.
- The owner's real meeting recordings are confidential: never read, use or commit them. Test data is AMI fixtures or invented data.

## Commands

Node is at `~/.local/share/scrb-node/current/bin` on the owner's Mac.

```bash
npm install            # also fetches the Electron binary
npm run dev            # UI in a browser at localhost:5183, on the mock backend
npm run check          # type check, lint, unit tests, boundary check
npm run test:smoke     # builds, then launches Electron headlessly
```

In the app, Ctrl+Shift+Alt+D opens the mock backend's hidden developer menu.
