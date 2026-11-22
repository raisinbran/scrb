# M1 common release-candidate preparation — source and binary identity

**Status:** READINESS COORDINATION ONLY. No release SHA selected, installer dispatched,
device accessed, installation changed, or M1 acceptance recorded by this work.
**Controlling plan:** `dev-plan/m1-installed-delivery-and-acceptance-20261118.md` v2.2.
**Observed main at 2026-11-21 PT checkpoint:**
`c6de7bc5cc284d4694678b43d3668905a7305684` = engineering baseline
only, **not** `FINAL_RC_SHA`.

## A1 — parallel workstreams and real blockers

| Lane | Verified public evidence | Remaining prerequisite | Status |
| --- | --- | --- | --- |
| Windows hosted source and installer | #376 and #402 merged; default-branch `.github/workflows/windows-installer-smoke.yml` contains guarded producer and real consumer | Execute one genuine pinned-source seven-tool producer, verify protected run/manifest provenance, then real disposable **standard-user** NSIS install/shortcut/uninstall and invented-data preservation. Existing PR/CI guard PASS and skipped producer/consumer are **not** this result | **NOT VERIFIED** |
| Mac M5 isolated candidate | #375 merged: build-only source `73e899d0`, verified 25 native inputs, dependency closure, notices, ad-hoc signature and historical disposable rehearsal. Candidate remains an **old source** | Verify actual safe idle, preserved production app/backup full identities and a current disposable swap-and-restore with partial/corrupt-copy failure behavior. Only then prepare a new build-only candidate from the later frozen source; do not replace `/Applications/Scribe.app` | **BLOCKED for install** |
| REGIURN | Historical Windows 11 readiness; no current access | None scheduled while host unavailable; later verified receipt/installation of same source RC | **UNAVAILABLE** |
| Speaker evidence | #411 synthetic source-behavior regressions merged | Known old E14 one-event mislabel root cause UNKNOWN; score actual final-RC three-voice behavior instead of speculative production patch or repeated historical inference | **NO NEW E14 RUN** |

The Windows workflow was inspected **on main**, so the former default-branch
workflow-file absence is resolved. This alone does not prove a hosted
producer or real install has run. The **legacy workflow still on main** exposes two false-default inputs,
`genuine_source_build_and_install` and
`permit_public_unsigned_test_artifact`, restricted to the repository
owner actor. **DO NOT DISPATCH:** the owner prohibits any public plaintext
unsigned installer artifact, regardless of one-day retention. Those
old booleans are not current publication permission. Draft [PR #420](https://github.com/raisinbran/scrb/pull/420)
implements a **ciphertext-only** handover with source/synthetic CI and
independent source-only approval, but **has not merged or run**. Its
protected-workflow authorization, main-only decrypt Environment,
unconfigured recipient/identity, separate app-ready launch check and
explicit owner authorization remain blockers. [Issue #419](https://github.com/raisinbran/scrb/issues/419)
also documents a proposed lower-assurance **single hosted runner with no
artifact upload**, requiring its own focused implementation, review and owner
decision; no fallback dispatch is approved. The applicable hosted producer
cap remains 105 minutes and consumer cap 20 minutes, plus overhead.
Never upload private binaries, models, recordings or the owner's library.

**Windows hosted exit evidence (required before marking PASS):**
verified actual checkout commit, all six public-source runtime tools
plus the seventh capture helper, source/build provenance per binary,
signed MSVC runtime checks, DLL closure and bundled notices, actual
NSIS installer and prepackaged executable hashes, independent
protected producer run ID/attempt and manifest/provenance/audit digests,
consumer identity as nonadministrator Medium-integrity user, successful
installer execution, correct Start Menu link target, genuine installed
app executable, uninstall and invented-library preservation. Capture
and M1 five-function tests are **not** established by hosted CI.

**Mac isolated readiness output (normal supported host only):**
`IDLE=PASS/BLOCKED` (recording and final pass known idle, not CPU
guesswork); `CURRENT_APP_AND_BACKUP=PASS/BLOCKED` (actual file-tree
digest and signature of both, with backup availability and owner
permissions); `DISPOSABLE_ROLLBACK=PASS/BLOCKED` (candidate swap,
partial/corrupt copy refusal, restored original digest); and
`NEW_FROZEN_RC_BUILD=PASS/BLOCKED` (build-only exact source,
tool/model closure, notices, package/ZIP digest and signature).
Do not repeat the old 25-input audit without an input change, use a
restricted Electron/Terminal sandbox for GUI acceptance, or touch the
real recording library. A dated historical rehearsal without its
rollback copy is not current rollback proof. Do not run the package
script's destructive `--install` option.

## A2 — final release freeze (NOT SELECTED)

Select `FINAL_RC_SHA` **only after** every applicable source, packaging
and security fix is merged, each PR's exact head passes automated
checks and receives **independent formal approval after CI**, and the
owner authorizes its merge. Do not substitute a later docs-only `main`
commit automatically or call app version `0.1.0` an artifact identity.
If source, native tool or dependency identity changes after freeze,
record why and nominate a new RC with affected gates rerun.

Before the first build on each platform, create a local release manifest
with the following fields. Use `UNKNOWN` / `NOT VERIFIED` for any
unobserved byte or process; do not copy historical candidate hashes
onto an unbuilt RC.

| Manifest item | Windows x64 | Mac ARM64 |
| --- | --- | --- |
| `final_rc_source_sha` and clean source tree | TBD | same exact SHA, TBD |
| App version and package build clock | TBD | TBD |
| Toolchain, target OS and signing truth | MSVC/NSIS etc., TBD | Swift/Xcode/Electron, ad-hoc or other signature, TBD |
| Capture helper source and SHA-256 | `scrb-capture.exe`, TBD | native capture helper, TBD |
| Speech/runtime tools (per-file SHA-256 and source ref) | Whisper CLI/server/VAD, sherpa, FFmpeg, ffprobe, other bundled runtime; TBD | the actual packaged tool set incl. llama, TBD |
| Recursive runtime closure | DLL filenames, SHA-256, linkage, Authenticode requirements; TBD | dylib filenames, SHA-256, resolved rpaths; TBD |
| Models and digest manifest | Required five speech models and manifest SHA-256, TBD | independently verified five-model payload/manifest, TBD |
| Licenses and notices | Actual packaged file hashes and FFmpeg configuration, TBD | Actual packaged file hashes and FFmpeg configuration, TBD |
| Final package identity | NSIS installer SHA-256 + size and prepackaged `Scribe.exe` SHA-256, TBD | `Scribe.app` tree digest, archive/ZIP SHA-256 + size, signature CDHash, TBD |
| Actual installed identity | Installer/package hash, on-disk executable hash, source marker, installed helper+models, isolated data path | Bundle/app hash, source marker, helpers+models, isolated data path |
| Gaps / reproducibility limits | Explicit, not implied away | Explicit, not implied away |

**Rule:** Same source SHA ≠ same app hash ≠ same native binaries. Verify
source identity and platform/binary identity **independently** after
packaging and again on installed hosts. Verify packaged runtime/model
lookups without developer PATH or source-checkout fallback. Fail closed
if the packaged Copy control, capture helper, model, or declared media
transport is absent. Preserve the old installed app until authorized
safe replacement and rollback are independently verified.

## A3 / B0 / B1 — owner-controlled execution sequence

1. **A1:** Obtain Windows *genuine* hosted install result (or a precise
   proven blocker) in parallel with Mac *isolated* candidate readiness.
   Do not infer device readiness from the other OS.
2. **A2:** After all release-relevant fixes/checks/reviews/merges, have
   the coordinator nominate one new exact `FINAL_RC_SHA` and verify
   per-OS package manifests **without installing**.
3. **A3:** Under approved normal-user isolation and backup protection,
   validate a short actual installed two-track smoke on each available
   host, with true non-silent mic/meeting sources and preserved user
   data. Any newly planned total >20 minutes needs its own owner
   approval.
4. **B0:** Obtain explicit owner approval of every numeric and method
   proposal in `docs/acceptance/m1-installed-rc-b0-scorecard.md`,
   including the 30-turn script, real routing, global speaker mapping,
   latency denominator, alignment calibration, and clipboard
   normalization. No acceptance recording before approval.
5. **B1:** Execute the five features **on one installed recording per
   available machine**, keep evidence locally, and verify restart
   persistence separately. Only M5 and BCHEN-W10 can provide up to
   **10/15 interim cells**. REGIURN stays NOT VERIFIED until available.
6. **Owner certification:** Require all 15/15 and persistence PASS on
   identified final-RC artifacts before M1 approval. No historical
   synthetic/AMI, old-installed, guard-only or source-only result
   fills these cells.

## Duration worksheet — use before *each* new host task

| Host/test | Setup and isolation | Capture/reference | Processing | Seek/copy/restart/inspection | Cleanup | Total | Permission |
| --- | --- | --- | --- | --- | --- | --- | --- |
| GitHub hosted real Windows build/install | inside producer | N/A | producer cap 105 min | consumer cap 20 min | inside jobs | up to 125 min of job caps, not accepted as physical M1 | **Owner-selected safe transfer and explicit run approval PENDING; no plaintext upload** |
| Mac isolated readiness (no install/recording) | measure and declare | none | none | normal-host safe idle + backup + disposable restoration | preserve all evidence | **not yet estimated by capable host** | no unsafe changes; obtain owner decision if >20 min |
| Mac installed B1 | host estimate required | host estimate required | host estimate required | host estimate required | host estimate required | **TBD** | owner B0 + task-specific >20-min gate |
| BCHEN-W10 installed B1 | host estimate required | host estimate required | host estimate required | host estimate required | host estimate required | **TBD** | owner B0 + task-specific >20-min gate |
| REGIURN | not scheduled | not scheduled | not scheduled | not scheduled | not scheduled | N/A | host unavailable |

Never reuse a prior >20-minute audio-analysis authorization, launch
a four/eight-hour test, overwrite owner data or secretly increase
the budget. Preserve **original** evidence on any failure and rerun
only newly justified affected checks after explicit approval.
