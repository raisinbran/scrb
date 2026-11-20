### A-890 — 2026-11-20 — W10 — private artifact provisioning could not access GitHub CLI configuration

- **Status / attribution:** Confirmed environment-access blocker; no repository or external state changed.
- **What failed:** The connected GitHub tools expose no private-repository creation or secret-write operation. A read-only GitHub CLI authentication check was attempted to determine whether a private agent-owned artifact repository could be provisioned, but the restricted Windows session could not read its GitHub CLI config under the user's AppData profile.
- **Impact:** No private artifact channel could be created or verified. The unsigned installer remains unavailable to the hosted workflow; no binary was uploaded or made public.
- **Correction / remaining risk:** Keep install checks NOT VERIFIED and continue using the guarded standard-user CI until an agent-accessible private destination and scoped workflow read credential are provisioned. Low.
- **Publication:** Included in PR #376's authorized reporting-correction commit; unmerged.

