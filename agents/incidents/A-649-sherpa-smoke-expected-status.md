### A-649 — 2026-11-16 — Codex / BCHEN-W10 — sherpa smoke assumed the wrong usage exit code

- **Effect:** A staged smoke stopped at `scrb-sherpa.exe` even though the executable loaded its DLLs and printed its expected usage text.
- **Evidence:** The new build returned exit code 2 for the no-argument usage check; the probe expected 1.
- **Cause:** I copied the expected status from an earlier binary without checking the current source-built sidecar's status contract.
- **Correction:** Expect status 2 for the intentional invalid-argument invocation, while still requiring the exact usage output.
- **Remaining risk:** Continue verification with the remaining tools and confirm the full dependency audit.
