# Mac M5 post-#375 incident and usage reconciliation — 2026-11-20

## Scope and source access

This branch is **a staging branch, not an approved incident publication or completed reporting PR**. It is separated from the exact-head reviewed [PR #375](https://github.com/raisinbran/scrb/pull/375) and from the frozen M1 source candidate `73e899d0a45234617b9fbc81cf8f599747ec652b`.

The Mac agent reported three additional incident records and the [2026-11-20 Mac incident-reconciliation usage row](/raisinbran/scrb/blob/rosmont/mac-m5-post375-accounting-20261120/agents/usage-log/2026-11-20-mac-pr375-incident-reconciliation.md) as **local and unpublished**. GitHub cloud access has not supplied their original content; **do not fabricate or paraphrase it as if recovered**. The only machine-specific action remaining is for a Mac-side agent to supply those source files and their usage row to this *separate staging branch* without modifying #375.

## Provisional new IDs and traceability

| Local reported Mac ID | Cloud-reserved replacement | Publication state |
|---|---|---|
| A-883 (previously remapped locally from A-881) | A-905 | Reserved provisionally; source content not yet received |
| A-884 | A-906 | Reserved provisionally; source content not yet received |
| A-885 | A-907 | Reserved provisionally; source content not yet received |

GitHub review checked `main`, **all 30 open PR changed-file lists**, and the separate unreviewed `rosmont/m1-packaging-coordination-20261118` branch. None contained A-905–A-907 at the time of the audit. W10 PR #376 already uses A-883–A-885 for **different incidents**, and its earlier A-869–A-874 files must stay untouched. Mac PR #375 currently owns A-875–A-880. The cloud coordination branch owns provisional A-900–A-904. See [issue #358 reservation entry](https://github.com/raisinbran/scrb/issues/358#issuecomment-7038111096).

**Local-only Mac, W10 and REGIURN reservations are not independently readable by GitHub.** The Mac agent must check that it has not already reserved A-905–A-907 for other events, and must flag any such collision before files are written. This mapping is not final until those original-source checks are complete.

## Acceptance for subsequent separate reporting PR

1. Preserve each existing Mac event account verbatim except for its assigned identifier, filename, header, and any minimum privacy-safe publication edits, with any original private evidence retained by the agent; preserve the historical A-881 → A-883 → A-905 mapping.
2. Supply all three real incident files, under `agents/incidents/`, and the real dated **12-column** `agents/usage-log/2026-11-20-mac-pr375-incident-reconciliation.md` with existing observed start/end, usage measurements, and reset information. Replace only A-883–A-885 citations to A-905–A-907 where they identify these Mac events.
3. Do not infer missing task metrics, rewrite immutable earlier usage entries, or treat the owner's retrospective GPT-6 Luna/High assumption for **Nov 15–19** as observed metadata for this **Nov 20** task.
4. Exclude absolute private host paths, secrets and owner recordings from public GitHub material; retain source evidence locally if an exact path is sensitive and document any deliberate redaction.
5. Once all source files are available, cloud coordination can validate collisions, create a **separate scoped draft PR**, await successful exact-head Windows/macOS CI, and arrange an independent formal GitHub review before seeking **explicit owner merge authorization**. Keep reviewed #375 head unchanged, do not rebuild or install the application, and do not trigger CI for empty placeholders.

**Outcome:** No additional original Mac incident content is claimed here. No app source or binary changed; no installation, device test or merge occurred.
