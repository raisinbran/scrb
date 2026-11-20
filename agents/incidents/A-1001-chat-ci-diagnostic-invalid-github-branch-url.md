### A-1001 — 2026-11-20 — ChatGPT Chat — Unsupported GitHub branch URL query

- **Status / attribution:** Confirmed self-induced read-only connector argument error; no repository state was mutated.
- **What failed:** A read of `cuc/library-test-timeouts-874490` used a GitHub REST branch URL with a slash-encoded branch name that the connected fetch endpoint rejected as an invalid repository path.
- **Impact:** One failed diagnostic lookup and a brief delay; no CI retry, branch operation, code change or local file access was performed.
- **Correction:** Used the connector's supported `search_branches` operation; confirmed that the old branch exists but is highly divergent from current main and unsuitable as a directly merged diagnostic fix for #384. The precise #384 Windows final-pass timeout classification is published in PR comment #7050955924.
- **Remaining risk / publication:** Low; this incident is staged on a separate unreviewed cloud accounting branch, not merged. Current public incidents/PRs were checked for A-1001; unreported local reservations remain unverified.
