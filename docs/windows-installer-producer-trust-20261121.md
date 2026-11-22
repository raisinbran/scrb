# Windows NSIS candidate — hosted producer/consumer trust boundary

**Status: source-integrated on `main`; genuine hosted build, NSIS install/uninstall,
and app launch NOT VERIFIED (November 21, 2026 PT).** PR #402 merged as
`d74ca8594c67085ffad17b8c73d8f2ff7ba947da`. The reviewed starting
`main` commit for this audit is `c6de7bc5cc284d4694678b43d3668905a7305684`.
The guard-only workflow checks are not a genuine installer acceptance result.
No `workflow_dispatch` run had been observed when this document was corrected.
This is a source-readiness audit, not a record of an executed installation.

## Live workflow and explicit dispatch gates

`.github/workflows/windows-installer-smoke.yml` is already on the default
branch. It contains the real, connected `verified-installer-producer` →
`hosted-real-installer-smoke` job graph. It is **not** future implementation work.

- The `pull_request` event runs `hosted-standard-user-guards` only; producer
  and real installer consumer must be SKIPPED.
- Manual `workflow_dispatch` exposes two required Boolean inputs, **both
  default false**: `genuine_source_build_and_install` and
  `permit_public_unsigned_test_artifact`.
- The producer requires both inputs to be true, `github.actor == 'raisinbran'`
  and `github.repository == 'raisinbran/scrb'`. Its script also checks the
  hosted-runner environment, `workflow_dispatch` event, `GITHUB_JOB` and
  the exact checked-out `GITHUB_SHA` before building.
- The producer job timeout is **105 minutes**; the dependent genuine
  standard-user consumer timeout is **20 minutes**. Setup, transfer,
  scheduling and cleanup add overhead. Do not treat the older, unused
  authorization for a different long test as an automatically valid approval
  for this complete run; obtain an explicit duration/scope confirmation.
- Dispatch only an **owner-designated, reviewed default-branch source SHA**.
  Recheck `main` immediately beforehand. A documentation-PR merge or another
  intervening commit changes that SHA; report the actual dispatched SHA.
  Source/branch identity from `GITHUB_SHA` must match the producer output.
- No private W10/M5 binaries, unsigned owner installers, models, recordings,
  or credentials may be incorporated into the public-source build artifact.

## Pinned tool-chain inputs and seven-tool closure

`scripts/build-win-hosted-tools.ps1` is implemented and invoked by the
producer. The executable set is exactly:

1. `whisper-cli.exe`, `whisper-server.exe`,
   `whisper-vad-speech-segments.exe` — compile pinned
   whisper.cpp commit `284029c07012d2000941a08d38a31ffb71f4734e`.
2. `scrb-sherpa.exe` — compile the **in-repository** wrapper against the
   official sherpa-onnx **v2.0.1 prebuilt shared-MD Windows x64 release**,
   with release archive SHA-256
   `11fd6a50b97eed38b54fb16d8219f49b16aa7f6a8e43a042316469ef47652e82`
   and recorded sherpa source commit
   `af2d8d81dbfa61c4cea4c568da78f3982edca005`.
   The Sherpa/ONNX shared runtime libraries are **verified upstream release
   binaries, not rebuilt locally from source**.
3. `ffmpeg.exe` and `ffprobe.exe` — compile FFmpeg **9.0** from
   `ffmpeg-9.0.tar.xz`, SHA-256
   `7f607a00dd0d28a729d5a4811205812eef01cf6ef6155025febb6f36a9062d52`,
   with libopus **1.6.1** archive SHA-256
   `6ffcb593207be92584df15b32466ed64bbec99109f007c82205f0194572411a1`.
   The build is configured without network, GPL or nonfree options.
4. `scrb-capture.exe` — compile the in-repository Windows capture source
   using `native/windows-capture/build.cmd` and pinned libopus commit
   `251d657e92fccfa3b05baec4f05756cce252fb75`.
   The capture source tree, compile flags, libopus library, and binary hash
   are recorded in its build manifest.

The source pins are embedded and checked by the scripts; the three upstream
Git commit IDs and the FFmpeg/libopus archive SHA-256 references were
confirmed during the read-only audit. Exact bytes of the Sherpa release,
the output executables and the hosted runtime DLLs have **not yet been
downloaded or checked by an actual producer run** in this workflow.

The producer verifies five MSVC Redistributable x64 runtime DLLs
(`msvcp140.dll`, `msvcp140_1.dll`, `vcomp140.dll`,
`vcruntime140.dll`, `vcruntime140_1.dll`) using
`Get-AuthenticodeSignature` with status `Valid` and Microsoft Corporation
signer before recording each actual SHA-256. Unlike the historical W10
candidate, freshly acquired signed DLLs are not falsely presented as having
the old pinned W10 hashes.

`scripts/stage-win-tools.mjs` walks DLL dependencies, refuses unresolved
non-system libraries and colliding DLLs, records
`PROVENANCE.json`/`DEPENDENCY-AUDIT.json` and carries the third-party
notices and licenses. Its executable probes cover the six speech/decoder
tools; capture dependency/source provenance is checked without executing
`scrb-capture.exe`. The existing `verify-win-package.mjs --slice 3`
requires seven executables, matching metadata/closure hashes and matching
staging versus packaged licenses/notices before NSIS packaging and again
in the protected producer. These checks are **implemented, not yet a
seven-tool hosted build PASS**.

## Producer outputs, transfer and consumer trust

The uploaded artifact is not its own root of trust. The producer uses
`scripts/package-win.ps1 -Slice 3` and `package-win-installer.ps1` with
`electron-builder --win nsis --x64 --publish never`. After verification,
the protected `package` step emits six job outputs through `GITHUB_OUTPUT`:

- `manifest_sha256` and `source_commit`
- `provenance_sha256` and `dependency_audit_sha256`
- `producer_run_id` and `producer_run_attempt`

The workflow maps these outputs independently to
`needs.verified-installer-producer.outputs`; the consumer must not take
trusted digests from downloaded JSON. The producer transfers exactly five
files: `Scribe Setup <version>.exe`, `Scribe.exe`,
`scribe-installer-candidate.json`, `PROVENANCE.json` and
`DEPENDENCY-AUDIT.json`. The artifact name includes run ID/attempt.
`actions/upload-artifact@v4` has `retention-days: 1`, and the consumer
uses `actions/download-artifact@v4` from the same run.

`win-installer-candidate-trust.psm1` verifies exact source/run/attempt,
the independently trusted manifest digest **before parsing JSON**, each
transferred file's name, size, SHA-256 and non-reparse-point location,
and separately trusted staging report digests before allowing installer
execution. Synthetic substitution tests change both an installer and
manifest and require zero launches. The source-integrated pre-execution
boundary is not proof of the behavior of a future downloaded candidate.

`run-win-installer-smoke-real-standard-user.ps1` creates a disposable
nonadministrator local account and launches a loaded-profile, Medium-token
child. `test-win-installer-smoke.ps1` checks NSIS install into a disposable
root, installed `Scribe.exe` SHA-256, the Start Menu shortcut **target**,
uninstall, retained invented user-data/library hashes, and cleanup.
The parent separately checks account, profile and scratch cleanup and
fails if any remain. These are **source-integrated checks; NOT VERIFIED
in an actual host-installed run**.

**Explicit scope gap:** `test-win-installer-smoke.ps1` says it never
launches the Scribe application and emits `scribeLaunched = false`.
An installer PASS cannot be called an **app-launch PASS**.
A separate reviewed, bounded launch check using an isolated synthetic
profile is required for that evidence. This workflow does not test real
microphone/meeting recording, transcription, models or M1 acceptance.

## Delivery choices and approval boundary

**A — Existing public Actions artifact (implemented, not authorized):**
A manual, owner-actor dispatch with both booleans true uses the above
one-day artifact channel. For this public repository, signed-in GitHub
users with repository read access may download that **unsigned** installer
during its retention period. The source workflow limits its contents to
the five public-source-only candidate files; no private asset should
enter this path. **Explicit owner approval of public exposure** is
required separately from authorization of the long hosted test. It is
not silently approved by a successful guard run.

**B — Private transfer (design option, NOT implemented):** Instead of
uploading unsigned bytes to the public repository's artifact channel,
use a separately reviewed private object store with GitHub OIDC
short-lived, branch/run/attempt-scoped identities for producer upload
and consumer read, private access policy, bounded retention and cleanup.
Transfer the same five files, but retain the six **independent producer
job outputs** and enforce the identical SHA/source/run/attempt trust gate
before execution. Review credentials, permissions, read-back integrity,
expiry and deletion failure cases; do not fall back to public upload.
This requires new infrastructure, workflow code, CI and independent
review before it is executable.

**Disposition:** A is the shortest path to genuinely observed hosted
installer behavior **if** the owner affirmatively accepts brief public
exposure of an unsigned, public-source-only test candidate. B offers
stronger artifact confidentiality but cannot be dispatched from this
repository today. Neither option authorizes a long run or establishes
app launch, physical recording or five-step M1 acceptance.

## Required evidence after separate authorization

Capture the exact `main` SHA, workflow run ID/attempt, all producer and
consumer job conclusions (never count SKIPPED as PASS), installer SHA-256
and size, source/staged/packaged seven-tool and DLL manifests, trusted
transfer checks, standard-user token, per-user installation,
installed executable hash, Start Menu target, uninstall, invented-data
preservation and account/profile/scratch cleanup. Report app launch
**NOT VERIFIED** until separately checked; never infer it from existence
of `Scribe.exe`. Record failures and per-task usage with normal incident
accounting. Do not automatically rerun an inconclusive or failed test.
