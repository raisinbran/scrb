### A-1232 — 2026-11-27 — Claude Code — Speakers redesign (#530) shipped with a misaligned empty state; later e2e run before building

- **Agent:** Claude
- **Attribution:** Confirmed self-induced. The #530 screenshots and tests covered populated states only; the empty state (no voice profiles) was never screenshotted or measured. An empty `PopupLayer` also sat as a flex child, adding a 16 px gap above the first card, and the compact empty text was 4 px off the heading inset. In this fix the first e2e run was also started before building the fresh worktree, so all five tests timed out for a setup reason.
- **Evidence:** Owner screenshot of the installed build: heading and empty text on different left edges, list card top 16 px versus detail card 32 px, blank detail card.
- **Impact:** A visible UI defect merged; one wasted e2e run (about 5 minutes).
- **Correction:** Popup layer moved out of flow, empty text inset fixed, detail panel gets an empty state, real bounding-box guard added at 1280, 900, 760 and 720 px, design-guide checklist line added. No start usage reading was taken.
- **Remaining risk:** Low. Check every state of a screen, and build before running Electron e2e.
