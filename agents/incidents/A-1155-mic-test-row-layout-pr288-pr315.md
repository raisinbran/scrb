### A-1155 — 2026-11-25 — Claude Code (Sonnet-class UI session) — Mic-test row layout was a poor design decision (PRs #288, #315)

- **Agent:** Claude (Sonnet-class UI session)
- **Attribution:** Confirmed agent design error by Claude (Sonnet-class UI session). The branches used the old `cuc/` prefix, which was Claude Code's prefix.
- **What failed:** The mic test was built as a button, a bare meter and a note, with no label or alignment rule shared between them. The meter reused the Live screen's `.levels` block, which carries a negative vertical offset and a left margin made for the Live pickers row, and the note slot had a fixed height. In Settings > Audio the "Mic" label and bar sat off the button's centre line and the status text drifted away, and nothing could wrap at narrow widths. A test then locked in the fixed note height, so the flaw looked intended.
- **Impact:** A visibly misaligned control on a main Settings screen, reported by the owner on 2026-11-25. No data or recording effect.
- **Correction:** The meter uses its own compact style with no offsets; the button, label, meter and status form one vertically centred row that wraps cleanly when narrow; the test now checks the wrap rule instead of a fixed height. Screens were checked at 1100 px and narrow widths in both themes.
- **Remaining risk:** Low. Layout is checked by screenshot, not by an automated visual test.
