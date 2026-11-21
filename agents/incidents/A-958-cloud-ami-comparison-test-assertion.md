### A-958 — 2026-11-20 — Research comparison test initially expected the wrong diagnostic wording

- **Status:** Confirmed authoring error found in self-review before a passing test was claimed; not a production research or AMI model defect.
- **What failed:** The first new paired-window comparison test expected an error message containing 'source windows' when the pair validator emits 'paired reports must match ...'. Leaving the assertion unchanged would have failed a correct mismatched-source rejection.
- **Cause:** Wrote a negative-test expectation without checking the exact validation error path.
- **Effect:** One correction commit on the research branch and another source-head CI cycle. The failed expectation was corrected before the newer run could be cited as accepted. No raw audio, existing files or production thresholds were changed.
- **Correction:** The assertion now matches the actual mismatch diagnostic without weakening the mismatch guard. The validator still refuses different windows, source commits, model basenames, or relabel settings.
- **Evidence:** PR #392 test diff in scripts/ami-remote-window-compare.test.mjs, correcting commit d221e1996c798ff7deb3ad436f4cfe41cb1b7452; this task's usage row.
- **Remaining risk:** Exact-head CI and independent review still required; this incident is distinct from A-957.
