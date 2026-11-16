### A-617 — 2026-11-16 — Codex / model variant and effort unavailable / Mac desktop — information button retained square focus ring

- The previous information-button styling removed its border and rounded its background, but left the shared square `:focus-visible` outline unchanged. The existing UI regression checked the circular hover target and sidebar focus, but did not assert the information button's keyboard-focus appearance; the owner reported the white square remained.
- Scoped the information variant's keyboard focus indicator to a circular focus-colored shadow while keeping a visible keyboard ring. Added explicit native-style reset and assertions for info-icon focus in light and dark themes.
- Remaining risk: corrected appearance awaits exact-head Mac and Windows CI and independent review.
