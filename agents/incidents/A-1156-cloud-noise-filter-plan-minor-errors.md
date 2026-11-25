### A-1156 — 2026-11-25 — ChatGPT — unnecessary source lookup and plan-length rework

- **Agent:** ChatGPT (GPT-6, ChatGPT Chat cloud).
- **Effect:** A first-source read requested root APPROVALS.md (404, instead of packages/contracts/APPROVALS.md); another guessed an absent usage-row filename (404); one surplus web length request produced an invalid-argument response. The initial plan draft was 1,345 words, longer than the requested concise limit, and needed one source-document revision before PR publication. These were avoidable tool overhead and writing waste, not product defects.
- **Source evidence:** The failed read and search/length responses in this task; the first published draft commit 7618bb1 and tightened 1,035-word plan commit e04a478.
- **Cause:** Unverified filename assumptions, an unnecessary follow-up tool action, and insufficient length control before initial publication.
- **Correction:** Read the actual packages/contracts/APPROVALS.md and usage-log README plus a verified usage row; removed surplus prose, kept all six options and quantitative gates, and verified the replacement plan word count before PR publication. No workflow was dispatched, no tests or devices were run.
- **Remaining risk:** Documents are not independent technical/security review. Upstream license/weight obligations and both platforms' actual audio behavior remain to be validated; no production behavior or model changed. Number checked against main (highest 1154) and open PR search (1155 already reserved; 1156 was free at time checked). Parallel unpublished claims remain unknown.
- **Usage:** agents/usage-log/2026-11-25-cod-v1-noise-filter-plan.md; measured usage allowance unavailable, no exclusive cost inferred.
