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
- **Independent review:** Plans and recommendations made in a planning/decision role need at least one review round by an agent other than the author before owner approval. Run automated checks before independent code review; review must precede merge. A model switch within one author session does not count as independent review. If no reviewer is available, report review as pending.
- **Claude model routing:** When Claude Code is assigned work, follow `agents/claude_model_split.md` for Opus/Sonnet/Haiku and effort choices; this does not change the agent or file ownership assigned by the owner.
- **Shared weekly quota authorization (owner decision, 2026-11-08):** All agents using a finite, included weekly allowance may work on an authorized task up to 99% cumulative weekly usage by default, leaving at least 1% remaining. Reaching 100% requires explicit, task-specific owner permission and a durable handoff **before** exhaustion. This extends the November 7 Codex rule to other metered agents; it does not permit paid overages, resets, extra subscriptions, scope expansion, or merging. Treat a rounded quota display and shared usage conservatively. See `agents/agent_task_allocation.md`.
- **Mandatory agent usage log:** For each assigned task, including project-related Claude chat planning and review, record the agent/model, device or surface, outcome, five-hour and weekly **remaining allowance percentages at start and end**, observation and reset times where visible, and known overlapping account usage. Claude chat and Claude Code share a subscription quota. Record `unavailable` or `not applicable` rather than inventing figures. Enter or propose the row in `agents/agent_task_allocation.md` and report its status in the handoff; never bypass branch/PR approval to log usage.
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
