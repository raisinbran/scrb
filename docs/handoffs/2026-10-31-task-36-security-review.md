# Task 36 — security and privacy review (QA-corrected)

**Scope:** existing Electron IPC, static asset serving, filesystem paths, logging, and proposed model/import/export bridges. **Evidence:** source inspection plus the independent 2026-10-31 QA review. This is a risk review, **not** a demonstrated exploit or a passed security gate.

## Ranked findings

| Priority | Finding | Smallest next check or fix |
| --- | --- | --- |
| Medium | Post-setup network isolation is **not fully proven** across Electron main, helper and model workers. The original report incorrectly said the renderer had no CSP; QA verified the built renderer already has `default-src 'self'`. | Add a synthetic offline/egress smoke check spanning processes after setup, including worker failure paths, before proposing any new network policy |
| Medium | Worker stderr/error and unknown logger fields have not been tested for accidental transcript text. `Logger` already filters sensitive keys and normalizes scalars. | Inject invented text in fake worker stderr/errors and assert it never persists in app logs or crash reports |
| Medium | Future import, playback, export and model-downloader routes will touch files or endpoints; they need separate narrow checks when implemented. | Preserve existing typed, allowlisted backend bridge; test token/path/URL restrictions in their respective tasks |
| Low | `isTrustedSender` checks frame origin only. With owned app pages and no subframes, cross-frame exploitation is not demonstrated. | Consider checking owned `webContents` and main frame in an approved, focused security plan; reject malformed URLs without throwing |
| Low | `serveRenderer` checks lexical containment but does not follow symlinks to canonicalize target. An attacker would already need write access to app-owned static assets. | If hardening, test synthetic symlink and encoded traversal without adding protocols or weakening CSP |
| Low | `openMeetingFolder` uses `realpath` containment then passes the result to the OS shell. A check/use race requires a local actor changing the library at that instant. | Keep strict app-owned path handling; test junction/symlink swaps on both OSes only if the risk warrants the extra complexity |

## Controls observed

- `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`, and `webviewTag: false`.
- A single call and event channel; preload/main derive allowed names from `CALL_NAMES` and `EVENT_NAMES`. Runtime request validators use exact shapes.
- Navigation and popup restrictions; Electron OS permission prompts denied.
- QA verified the **built** renderer CSP (`default-src 'self'`), which the earlier report missed.
- App storage and logger enforce baseline path and sensitive-key restrictions; these do not replace process-wide leak testing.

## Open decisions for Claude Code

1. **Recommendation:** test observable egress and worker stderr first; do not add a blanket replacement CSP or duplicate IPC channel.
2. **Recommendation:** defer low-risk local-path hardening until the related playback/packaging code exists, unless a reproducer establishes a credible escape.
3. **Required process:** `CLAUDE.md` calls security and IPC modifications risky. Any security-code change needs a short plan approved at its relevant phase gate.

**Not run here:** `npm run check`, security scanners, live CSP inspection, Electron attacker harness, network instrumentation, model launches, real hardware, or Windows/macOS junction race tests. QA's reported CSP inspection and passing baseline checks were not independently repeated in this session.
