# Phase 0 Parallel Tasks

Created: 2026-10-29 evening, while the Mac runs its device cases and then the
8-hour drift run (about 18:00 to 02:30 PT).  These tasks do not depend on
those runs and can go ahead at the same time.  Each one reports back by
commit (or, for B, by the owner's answers); the Mac session folds the
results into `evidence/gate-0.md`.

**Do not run anything heavy on the Mac until the drift run ends.**  Part of
its purpose is the stall rate of an idle machine; other load would skew it.
Light use (browsing, reading) is fine, but do not close the lid or choose
Sleep.

## A. Windows device and permission cases (a Windows PC) -- done

Results merged into `evidence/gate-0.md`.  Only the optional
`mic-privacy-off` and USB-unplug cases remain.


Follow `HANDOFF-WINDOWS.md`.  Any Windows 10/11 PC works; it needs only the
two probes built, no models.  About an hour with a person at the PC.  It
commits a results table and the small result files, then pushes.

## B. Owner decisions (the owner; no machine)

Gate 0 also needs the owner to decide the plan's open items.  The evidence
for each is in `evidence/gate-0.md`; the proposals are in its
"Recommendations" table.  None depend on tonight's Mac runs, except that the
macOS stall finding (a few stalls per hour of up to ~0.4 s, padded and
marked) may inform item 1.

Write each answer under "Decision" (accept, change, or "need more data"),
commit, and push; or reply in the Mac session with the answers.

| # | Open item | Proposal | Decision |
| --- | --- | --- | --- |
| 1 | Desktop shell | Electron with project-owned capture adapters (Meetily fails decision rule 1) | Accept |
| 2 | Live / final speech models | GPU: large-v3-turbo-q5_0 live and final, per VAD segment.  CPU-only: small.en-q5_1 live (`-ac 768`), turbo final.  `-mc 0` for whole-file passes | Accept |
| 3 | Live diarization | Incremental per-segment clustering (join 0.5) with the "Speaker ?" rule; offline relabel in the final pass | Accept |
| 4 | Summary model | Qwen3.5-9B Q4_K_M (80% recall on GPU, 76% on M5 Metal) | Accept |
| 5 | Audio chunks | 5 s Opus chunks, mono 32 kbps per track, each with its first frame's device timestamp; new chunk at every discontinuity | Accept |
| 6 | Voice-match confidence line | Provisional 0.55--0.60 cosine; re-measure across sessions in Phase 4 | Accept |
| 7 | DOCX library | Follows Electron: a Node DOCX writer such as `docx` | Accept |
| 8a | Final DER target 20% | Best measured 21--28% (AMI); accept ~25% or keep 20% as a stretch goal | Change: pass line ~25%; keep 20% as a stretch goal |
| 8b | Summary recall target 90% | Best measured 76--84%; accept ~80% | Change: pass line ~80%; keep 90% as a stretch goal |
| 8c | Live-versus-final WER 15% | About 10% at GPU full context; keep | Accept (keep 15%) |
| 8d | RAM guidance | 16 GB minimum works; recommend 32 GB as typical | Accept (16 GB minimum, 32 GB recommended) |

## Not parallel

- Mac device cases and the 8 h drift run: in progress on the Mac tonight.
- The Gate 0 decision itself: needs A, B and the Mac runs.
- Phase 1 work: blocked until Gate 0 passes.
