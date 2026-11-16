### A-617 — 2026-11-16 — Codex / model variant and effort unavailable / Mac desktop — information button retained square focus ring

- The previous information-button styling removed its border and rounded its background, but left the shared square `:focus-visible` outline unchanged. The existing UI regression checked the circular hover target and sidebar focus, but did not assert the information button's keyboard-focus appearance; the owner reported the white square remained.
- Scoped the information variant's keyboard focus indicator to a circular focus-colored shadow while keeping a visible keyboard ring. Added explicit native-style reset and assertions for info-icon focus in light and dark themes.
- The fix passed exact-head Mac/Windows CI run 43968324993 on `d80e01f7f717d5b92dafae4d5f136d9967ac4532`; independent re-review found no actionable issues. The pending-status wording in this incident entry was corrected in A-619.
