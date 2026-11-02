# Gate test evidence: persistent runs and GitHub reporting

Use the owner-approved [retention policy](evidence-retention-policy.md). This workflow is for substantive real-device tests; ordinary disposable unit fixtures are unaffected.

## Run and publish

Install the repository dependencies and ensure `git push` to your own `rosmont/*` branches is authenticated. Run on a checked-out SRCB branch:

```sh
node scripts/gate-evidence.mjs run --gate 3 --platform macos --id mac-20261102-diagnostic-01 -- node ./node_modules/playwright/cli.js test --config apps/desktop/playwright.config.ts apps/desktop/e2e/real-recording.spec.ts
```

On Windows, change `--platform macos` to `--platform windows` and use a unique run ID and the correct local test command. Commands run from the repository root; build and environment variables required by the test must already be set. **Do not start another physical run solely to try this helper.**

The wrapper writes a `run.json` and private `test-console.log` to:

- macOS: `~/scrb-gate-evidence/<run-id>/`
- Windows: `%USERPROFILE%\\scrb-gate-evidence\\<run-id>\\`

The `SCRB_GATE_EVIDENCE_HOME` environment variable can change the parent directory. It must be outside the Git repository. The wrapper also sets `SCRB_GATE_EVIDENCE_ROOT` and `SCRB_GATE_EVIDENCE_DIR` for the child process. The tracked real-recording and final-pass Playwright tests use this persistent root rather than the system temporary directory; update other/new physical scripts to do the same.

At the end, the wrapper inventories **every file** below the evidence directory, hashes it, and keeps the inventory **locally**. It creates `safe-report.json` containing only allowed numeric measurements, evidence presence, the hash of that private inventory, and test/commit identifiers. It commits and pushes **only** this JSON report to a new `rosmont/gate-evidence-<platform>-<run-id>` branch, under `docs/gates/evidence/`. It never adds raw logs, raw audio, transcript text, meeting titles, paths, or credentials to the Git checkout. It does not open or merge a pull request.

If GitHub push fails, the wrapper returns nonzero, preserves all local evidence, and leaves `safe-report.json` in the run folder. The agent must report publication as pending, rather than claiming that GitHub has the evidence.

## Optional scored metrics

A test agent can write `metrics.json` into the run folder **before** the command finishes, for example:

```json
{
  "recording": {
    "durationSec": 14338.6,
    "decodedChunks": 5779,
    "decodeFailures": 0,
    "microphoneGapMs": 808,
    "meetingGapMs": 951
  },
  "performance": {
    "peakMemoryMiB": 1219,
    "stopAcknowledgmentMs": 11.6
  },
  "live": {
    "wordCount": 10839,
    "samples": [
      { "elapsedSec": 0, "meetingWords": 0, "speechPresent": true },
      { "elapsedSec": 60, "meetingWords": 95, "speechPresent": true }
    ]
  }
}
```

The numbers above are **illustrative**, not certified results. A test should populate its own complete minute-level (or finer) samples. `speechPresent` must come from known audible public input or independently verified live PCM, **not** from the transcription model. Long meetings may contain genuine silence; mark those intervals false. The check rejects at least 120 seconds of continuous known speech without new meeting-track words. This is a **stall guard**, not a substitute for Gate 3's stronger latency, accuracy, gap, and worker-recovery acceptance criteria.

The script never copies `metrics.json` verbatim: it publishes only explicitly selected numbers. If metrics or speech-continuity evidence are missing, it reports `INCOMPLETE`; if the command fails, decoding reports failures, or a known-speech stall is detected, it reports `FAIL`. `CHECKS_PASSED` means only these automated checks passed. It **never means the gate is approved**.

For a test already run with this wrapper, publish again from its existing directory without repeating the test:

```sh
node scripts/gate-evidence.mjs publish --gate 3 --platform macos --id mac-20261102-diagnostic-01 --exit-code 0
```

Use `--local-only` to write the local report without GitHub push. Do not overwrite an existing run ID. Raw evidence is kept until explicit owner-authorized cleanup following the applicable gate approval and final retention review.

## Scope and review

This is preliminary cloud-prepared code. Independently review the GitHub branch publication permissions and run one **synthetic, short** wrapper test on each OS before relying on it for the next long test. It is not installed into a currently running untracked Mac diagnostic harness, nor is it yet wired to PR #42's unmerged import/playback spec. Integrate those paths without disturbing an active run.
