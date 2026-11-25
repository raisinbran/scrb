### A-1152 — 2026-11-24 — Claude Code (Sonnet 5.5) / Windows — Windows B0: main run started at an output volume I had not set

- **Agent:** Claude (Sonnet 5.5, Windows desktop app)
- **What failed:** I set the output volume to 55% for the third preflight, then did not re-read or re-set it right before the main run. Windows read 36% at the start and 32% at the end (cause unknown, the same drift seen on the Mac), so the microphone barely heard the speakers: no usable end beep in the microphone track and an inconclusive bleed figure. The first two preflights also ran at 16% and 30% because I had not read the starting volume first.
- **Impact:** Cell 1 NOT VERIFIED and bleed inconclusive; two extra preflights. Not rerun.
- **Correction / remaining risk:** Read and set the volume immediately before a measured run and abort if it differs. The microphone beep may also be cut by Windows microphone processing; not shown.
