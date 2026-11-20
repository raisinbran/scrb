### A-869 — 2026-11-19 — W10 — pre-install artifact hashes read in the excluded sandbox context

- **Status / attribution:** Confirmed process error during the bounded A3 pre-installation preflight; no product defect established.
- **What failed:** I ran read-only SHA-256 commands for the existing installer and unpacked executable before checking the shell principal. The shell reported the restricted Codex sandbox identity, which the assignment explicitly excludes for this host verification.
- **Impact:** The two matching hash outputs are sandbox observations only and cannot satisfy the required normal-user host verification. No install, launch, profile/library access, model verification, or recording occurred.
- **Correction / remaining risk:** Stopped artifact checks after identifying the context. Mark host hashes and the five-model handover as unverified until a normal, non-elevated host session performs the bounded checks. No application or user data was changed. Low.
- **Follow-up:** The owner later confirmed normal-user, non-elevated integrity checks passed for the installer, executable, model manifest, and all five payloads in issue #340. Those checks are complete; W10 did not repeat them. The sandbox outputs remain excluded as evidence.
- **Publication:** Local and unpublished in `agents/incidents/`; this incident, its A3 usage row, and the revised smoke harness are included in the W10 automation PR branch pending normal review.

