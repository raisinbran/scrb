### A-1156 — 2026-11-25 — Codex Desktop / Mac — privacy test used an unsupported role-query option

- **Agent:** Codex (gpt-6.2-sol, Mac desktop)
- **Effect and evidence:** The required check stopped before the push. The desktop typecheck rejected the test with `TS2769: No overload matches this call`, explaining that `exact` does not exist in `ByRoleOptions`.
- **Attribution:** The new test supplied the option from a different role-query API. Runtime tests had accepted the extra property.
- **Correction:** Removed the unsupported option. The same role and string names still select the intended controls.
- **Remaining risk:** The installed privacy behavior is still outside this test.
