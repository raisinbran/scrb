### A-650 — 2026-11-16 — Codex / BCHEN-W10 — FFmpeg license probe rejected wrapped valid text

- **Effect:** The staged smoke reported the FFmpeg license check as failed after both staged executables and the FFmpeg build configuration had passed.
- **Evidence:** `ffmpeg.exe -L` returned exit code 0 and the LGPL text; line wrapping split `GNU Lesser General Public` and `License` across adjacent lines.
- **Cause:** I used a regex that required one literal space between those phrases instead of accepting whitespace/newlines.
- **Correction:** Match `GNU Lesser General Public\\s+License` in the captured output.
- **Remaining risk:** Re-run the staged smoke and confirm every expected tool and the FFmpeg configuration.
