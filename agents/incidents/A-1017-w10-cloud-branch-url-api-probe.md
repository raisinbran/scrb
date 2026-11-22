### A-1017 — 2026-11-21 — Cloud — Unsupported encoded GitHub branch fetch

- **Attribution:** Confirmed self-induced read-only connector request error.
- **Effect:** Attempted to verify the newly created W10 follow-on branch via the generic GitHub fetch endpoint using a slash-containing branch ref percent-encoded in a repository branch URL. The GitHub connector rejected the request with `INVALID_ARGUMENT: GitHub Fetch URL contains an invalid repository path`.
- **Correction:** Queried the branch with `search_branches`, compared it against exact PR #376 parent head with `compare_commits`, and verified the stacked PR metadata. No file or ref state changed from the rejected read.
- **Prevention:** Use normalized GitHub branch search/ref and compare actions instead of constructing unsupported generic fetch URLs.
- **Remaining risk:** None for that read; no CI or test retry. Current main/#396/#402 public incident files showed no A-1017, but unpublished reservations remain outside this cloud view.
