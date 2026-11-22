# Windows NSIS candidate — hosted producer/consumer trust boundary

**Status: P1 consumer code correction; actual hosted installer producer and
normal-user install/uninstall remain NOT VERIFIED.** The existing Windows installer
guard workflow only exercises its disposable-account safety checks. Its green CI
must never be described as a real NSIS installation pass.

## Root of trust

The replaceable candidate artifact is **not** a source of trusted hashes. Its
scribe-installer-candidate.json, Scribe Setup *.exe, Scribe.exe, PROVENANCE.json
and DEPENDENCY-AUDIT.json are all untrusted until checked.

The future **separate protected GitHub Actions producer job** must use a checkout
of the exact workflow source commit and build all required Windows binaries
from independently pinned public sources. No W10/M5 local binaries, private
models, or existing installer candidates can be imported as hosted build inputs.
It must validate the full seven-tool stage, DLL closure, license files, capture
source/build provenance, and matching prepackaged resources/bin using the
existing verify-win-package.mjs slice 3 verifier before invoking
package-win-installer.ps1. That script re-verifies the stage after NSIS
packaging, compares manifest source and metadata digests to actual files and
then, **only in the verified-installer-producer job**, emits to its own
GITHUB_OUTPUT channel:

- manifest_sha256, source_commit
- provenance_sha256, dependency_audit_sha256
- producer_run_id, producer_run_attempt

These are protected **job outputs**, not fields obtained from a downloaded
artifact, user input, PR comments, or local developer paths. A future workflow
must explicitly map producer-step outputs to job outputs. The consumer must
receive them exclusively from needs.verified-installer-producer.outputs, and
the hosted checkout must use the same GITHUB_SHA/GITHUB_RUN_ID/RUN_ATTEMPT and
repository identity. If any prerequisite is absent or mismatched, stop before
launching any candidate executable. Cross-job handoff must also keep the
unsigned installer private; uploading it to a publicly accessible Actions
artifact location is not authorized.

## Consumer contract

scripts/win-installer-candidate-trust.psm1 implements the verified pre-launch
boundary used by scripts/test-win-installer-smoke.ps1 when CandidateManifestPath
is supplied. It requires the six independently supplied producer outputs,
checks exact hosted source/run identity, verifies the manifest digest **before
parsing it**, and independently hashes the four files against that already
trusted manifest. It also verifies the PROVENANCE and DEPENDENCY-AUDIT digests
against the *separate* producer outputs and rejects linked/missing/out-of-root
files. The launch callback cannot run if any verification fails.

scripts/test-win-installer-candidate-trust.ps1 uses invented bytes only. It
first verifies that the guarded callback can run on trusted input, then
changes **both the installer and its manifest together** while keeping the
original out-of-band manifest digest unchanged; it requires rejection and
zero launch callbacks. Other negative controls cover a mismatched source/run,
substituted staging report and missing producer evidence. The Windows unit
suite runs that test without starting an installer. The frozen, owner-verified
A2 SHA path remains a distinct explicit path; the new candidate branch no
longer accepts a self-consistent artifact as proof of its own identity.

## Remaining real-build dependency

The hosted source-build recipe for Whisper.cpp, Sherpa sidecar, official
Sherpa/ONNX Runtime release closure, FFmpeg and the seventh capture helper
is not implemented in the guard workflow, and the full disposable-user
NSIS installation has not run. Neither the six pinned runtime tools nor the
seventh capture helper may be silently substituted by the W10 candidate.
The locally reported scrb-capture.exe hashes 6c636359...9c80bd and
740580d9...0491bf refer to **different inspected candidates**, not one
interchangeable hosted binary. Each future hosted build must publish its own
independent full source/build/provenance hashes. The scripts above do **not**
claim an authorized, reproducible hosted build has already occurred.

Before a real installer run, implement the trusted producer recipe, keep all
source checks and license obligations, wire its protected outputs to the
consumer, prove the standard-user token and cleanup in the existing disposable
runner, and obtain independent formal review of that complete flow. Do not
start a >20-minute hosted build-and-install run prematurely; no physical
recording, W10 transfer, or installed M1 acceptance is authorized here.
