### A-632 — 2026-11-16 — Codex / model and effort unavailable / Mac desktop — full check retry

- The first repository-wide `npm run check` attempt ran inside the restricted sandbox. Tests that start local loopback servers failed with `listen EPERM`, while related worker tests timed out.
- Stopped the stalled sandbox run and retried the same full check with approved local loopback access. The retry passed all runnable checks; real-decoder tests were skipped because bundled ffmpeg is absent.
