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
- **Test-duration authorization (owner decision):** obtain explicit owner approval **before starting any test expected to exceed 20 minutes total**, including setup, recording, transcription/final processing, and cleanup. A test reasonably planned for 20 minutes or less may safely finish if it inadvertently runs slightly over; do **not** automatically stop it or interrupt the owner solely because the clock passes 20 minutes. Reassess material unplanned extensions and obtain approval for separately planned long tests or repeats. Do not automatically rerun failed or inconclusive tests.
- **Do not automatically delete gate test recordings or evidence, even after a passing test.** Keep raw audio, transcripts and diagnostics until the owner passes the relevant gate and explicitly authorizes cleanup; preserve any evidence needed through final app completion. Follow [the gate evidence retention rule](docs/gates/evidence-retention-policy.md).
- The owner's real meeting recordings are confidential: never read, use or commit them. Test data is AMI fixtures or invented data.

## Mandatory agent-caused failure reporting

**Owner decision, 2026-11-03:** ChatGPT and Codex must document **every identifiable self-induced failure** in [the existing agents-folder incident register](agents/agent_self_induced_failures.md), including wrong instructions, QA mistakes, false test failures, test-harness/setup errors, unnecessary retries, misleading completion claims, and preventable credit/owner-time waste. Log incidents even when subsequently fixed or unrelated to a production-code defect. Name the observed effect, source evidence, actual/provisional attribution, correction and remaining risk. Do not erase or silently relabel agent errors as application failures. Keep private evidence out of Git; correlate quota impacts with [the usage tracker](agents/agent_task_allocation.md) without inventing exact task cost.

## Commands

Node is at `~/.local/share/scrb-node/current/bin` on the owner's Mac.

```bash
npm install            # also fetches the Electron binary
npm run dev            # UI in a browser at localhost:5183, on the mock backend
npm run check          # type check, lint, unit tests, boundary check
npm run test:smoke     # builds, then launches Electron headlessly
```

In the app, Ctrl+Shift+Alt+D opens the mock backend's hidden developer menu.
