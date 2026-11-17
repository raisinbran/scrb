### A-615 — 2026-11-16 — Codex / model and effort unavailable / Mac desktop — usage outcome remained stale after CI

- The published PR #333 usage row still said exact-head confirmation was pending after CI run 43960260670 passed on head `d468443a668739e047d5f2825d67b7966866a13d`. Independent re-review identified the stale outcome text.
- Corrected the row to record that run and the documentation-only review result. A subsequent check found this incident note retained a forward-looking pending-CI sentence after run 43961926878 passed on `0e1aa6b1ee64de9cfc689a6632e7e92979330c2f`; see A-635.
- The stale sentence is being replaced by this historical account. No product-code risk remains.
