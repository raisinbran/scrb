### A-574 — 2026-11-16 — Codex / model and effort unavailable / Mac desktop — Speakers full check

- The first full check found a type error because the CSS module's `.screen` lookup is typed `string | undefined`, but `Screen` accepts an optional `string` under exact optional property types.
- Pass a defined class string at the caller and rerun typecheck, tests, and the full check.
