### A-1037 — 2026-11-21 — PR #376 cloud merge-gate audit — malformed read-only ref URL

**Effect:** One GitHub API branch-ref query returned HTTP 400 for an invalid encoded slash in the repository path; no Git write was attempted and no state changed.

**Cause:** A literal `%2F` embedded in the branch path was rejected by the connector's path guard.

**Correction:** Read the exact GitHub pull request metadata for #376 and stacked #402 directly, obtaining their head, base and branch-name values. Confirmed #402 still targets #376's branch; deletion is forbidden until #402 has been safely retargeted and W10 worktree dependencies checked. No repeated failing query.

**Remaining risk:** The real W10/M5 unpublished incident checks are pending, unrelated to this metadata probe.

**Usage impact:** One rejected metadata read; task-exclusive quota and timing for that lookup are unavailable.
