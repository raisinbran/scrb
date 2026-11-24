### A-906 — 2026-11-20 — Codex Desktop — Local incident ID collided with a newer W10 reservation

- **Status / attribution:** Confirmed agent-caused reservation check omission; no conflicting Mac record was committed or published.
- **What failed:** I assigned A-881 to a local tool-call incident using an earlier PR #376 inventory. A later current PR #376 update had reserved A-881 and A-882 for distinct W10 events. The independent reviewer found this conflict before the local record or its usage row was published.
- **Impact:** One local incident ID and its usage-row reference were temporarily conflicting; PR #375's published head and four corrected Mac IDs were unaffected.
- **Correction / remaining risk:** The local tool-call incident and its usage reference were first remapped A-881→A-883 after checking current main, open PR paths, and known reservation notes, then remapped A-883→A-905 for this separate staging branch. The source and usage row are copied there pending a scoped PR. Low.
