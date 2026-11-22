# Windows NSIS candidate — hosted producer/consumer trust boundary

**Superseding owner decision (November 21 PT): Keep `raisinbran/scrb` public, but DO NOT publish a plaintext unsigned Scribe installer to public Actions artifacts.** This decision supersedes the historical public-plaintext Option A recommendation in the original document. The existing source implementation still permits a public plaintext artifact under its old dual input gate, but that path is **NOT AUTHORIZED**. Encrypted producer-to-consumer transfer **is implemented and synthetically CI-tested on unmerged draft [PR #420](https://github.com/raisinbran/scrb/pull/420)** at reviewed head `203940a2`. Its [Windows/macOS/native CI #45002745740](https://github.com/raisinbran/scrb/actions/runs/45002745740) and [installer-guard CI #45002745834](https://github.com/raisinbran/scrb/actions/runs/45002745834) passed; [formal source-only review #6011304212](https://github.com/raisinbran/scrb/pull/420#pullrequestreview-6011304212) approved that head. **It is not merged, operationally authorized, or genuinely installer-tested.** The controlling requirements and protection gap are in [issue #419](https://github.com/raisinbran/scrb/issues/419).

**Status: the legacy plaintext-capable producer/consumer source is integrated on `main`; encrypted transfer exists only on unmerged #420. Genuine hosted build, NSIS install/uninstall, and app launch remain NOT VERIFIED (November 22, 2026 PT).** PR #402 merged as
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

## Controlling artifact-delivery decision — plaintext path prohibited

**Owner decision:** Keep the repository public and preserve the separate
verified producer and consumer jobs. **Do not dispatch the existing workflow
with `permit_public_unsigned_test_artifact=true`**; its implementation
uploads five original plaintext files, which is not an acceptable transfer.
The existing false-default gates and actor condition are not approval. No
public unsigned installer upload or genuine long run has been authorized.

**Encrypted source candidate IMPLEMENTED / CI-TESTED, but UNMERGED and BLOCKED:**
[PR #420](https://github.com/raisinbran/scrb/pull/420), at exact reviewed head
`203940a2`, implements the encrypted cross-job transfer described in
[issue #419](https://github.com/raisinbran/scrb/issues/419). Its producer
packages exactly five allowlisted files, encrypts them with pinned,
checksum-verified `age`, and uploads **only one ciphertext** with one-day
retention. The consumer decrypts in temporary scratch, validates the
archive before extraction, and retains all six independently protected
producer outputs and source/run/file integrity checks before execution.
Synthetic Windows CI and the independent source-only review have passed;
the two genuine producer/consumer jobs were **SKIPPED**, not PASS.
Encryption protects confidentiality in transit, not the origin of an
installer without the independent producer attestations. Current `main`
still contains the earlier plaintext-capable path; **do not dispatch it**.

**Decryption key and GitHub enforcement, NOT YET CONFIGURED/VERIFIED (including for unmerged #420):**
The private identity belongs in a dedicated GitHub **Environment secret**,
not a general repository secret. Restrict the Environment explicitly to
`main`, apply deployment review where practical, and grant the key only to
the intended consumer job. Protect edits to workflow files and their trusted
scripts from unauthorized main-branch changes: the observed
`GreatFirewall` ruleset (ID `27257173`) currently protects only
deletion/non-fast-forward and does not require PR review; no
`.github/CODEOWNERS` file exists **on current `main`**. Unmerged #420 adds a
CODEOWNERS declaration, but that file is advisory without enforceable
workflow-change authorization. An Environment alone does not confine
secrets to one named workflow. A single-owner account must avoid an
unfulfillable native multi-account approval requirement. Do not provision
the private key until the actual enforcement approach is independently
reviewed and demonstrably effective.

**Fresh-run authorization and input shape (implemented in unmerged #420):**
The encrypted candidate fails closed unless an explicitly authorized manual
dispatch runs on `refs/heads/main`, with the expected repository and both
actor identities, reviewed workflow path and `github.run_attempt == 1`.
A rerun must not inherit previous approval or reach the decryption
Environment. PR #420 replaces the old plaintext consent input with a new
default-false encrypted-run input; this safeguard is **not yet on `main`**.
No plaintext fallback may be enabled or dispatched.

**Archive and lifecycle hardening:** Before extraction, bound encrypted
and decrypted archive sizes, total expanded bytes and compression ratio.
Reject path traversal, absolute/ADS paths, duplicate or case-colliding
entries, missing or extra files, links and reparse points. Extract only
the five expected regular top-level files into fresh temporary storage,
then verify manifest SHA-256 before parsing, each independently bound
producer SHA-256 and exact source/run/attempt. Prevent any process launch
when a negative test fails. Clean scratch on all exits (not a claim of
forensic secure erase). Never disclose private keys in logs, arguments,
artifacts, job outputs, source or comments.

**Separate installed-app launch gap:** The current consumer explicitly
reports `scribeLaunched = false`. Before the expensive genuine installer
run, a reviewed bounded test must start the installed `Scribe.exe` as the
disposable nonadmin user with an isolated invented-data profile, assert a
real application-ready condition and clean exit, and not mistake file
existence or process creation for a launch PASS. No physical microphone or
meeting recording is part of that hosted smoke.

**Approval sequence:** Preserve the completed encrypted-transfer implementation,
synthetic CI and source-only formal review of #420; **do not repeat them**.
Establish and independently verify enforceable workflow-change authorization,
the main-scoped decrypt Environment and the separately reviewed installed-app
launch/readiness slice. The public recipient is still `UNCONFIGURED`; the
private identity has not been provisioned. Changes to recipient/security
controls or source require their own exact-head checks and independent
formal review, followed by specific owner merge permission. Only after these
gates seek **separate** owner permission for one encrypted handoff and the
actual 105-minute producer plus 20-minute consumer run with overhead.
Neither an approved source review nor this documentation authorizes key
provisioning, workflow dispatch, or a plaintext artifact upload. No other source,
test, merged PR or plan review authorizes dispatch.

**Historical alternatives — not selected:** A publicly retrievable plain
installer is **rejected**, even if restricted to one day. Private external
object storage with OIDC remains a fallback requiring additional approved
infrastructure and security review. Neither is currently an authorized
operational route.

## Required evidence after separate authorization

Capture the exact `main` SHA, workflow run ID/attempt, all producer and
consumer job conclusions (never count SKIPPED as PASS), installer SHA-256
and size, source/staged/packaged seven-tool and DLL manifests, trusted
transfer checks, standard-user token, per-user installation,
installed executable hash, Start Menu target, actual bounded app-ready launch, uninstall, invented-data
preservation and account/profile/scratch cleanup. Record ciphertext-only transfer, Environment authorization, source/run/attempt binding and rejection evidence separately. Report app launch **NOT VERIFIED** until a genuine startup readiness signal and clean termination are independently checked; never infer it from existence of `Scribe.exe`. Record failures and per-task usage with normal incident accounting. Do not automatically rerun an inconclusive or failed test.
