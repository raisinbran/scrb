### A-862 — 2026-11-19 — W10 — default sandbox read of per-user model manifest was denied

- **Status / attribution:** Confirmed access-boundary attempt; no handover files changed.
- **What failed:** A default-context `Get-FileHash` attempted to read the generated model manifest under the per-user LocalAppData handover, outside the writable workspace; the sandbox denied access.
- **Impact:** No hash was obtained by that attempt; the handover remained intact and its staged `-VerifyOnly` result remained PASS.
- **Correction / remaining risk:** Used the narrowly approved read-only command to retrieve the digest, which matched the pinned source manifest. Low.
