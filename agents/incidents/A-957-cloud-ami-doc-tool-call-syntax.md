### A-957 — 2026-11-20 — Cloud research-document publication script syntax rejected

- **Status / attribution:** Confirmed minor authoring/tool-orchestration mistake; not an AMI, application, security or CI runtime failure.
- **What failed:** An initial JavaScript tool-call template for the expanded AMI evaluation document used an unescaped Markdown backtick inside a JavaScript template literal. The tool rejected the expression as a syntax error before GitHub mutation.
- **Effect:** One avoidable failed publication invocation and an additional correction call; no repository file or branch was altered by the rejected invocation. No AMI audio/model execution, recording or test retry occurred.
- **Correction:** Reissued the document publication with delimiter-safe text, then verified the commit. The AMI scratch-path correction was published separately with explicit negative tests.
- **Evidence:** The failed and corrected tool-call responses in this task; docs/research/ami-remote-speaker-threshold-08-screening-20261120.md on PR #392; usage row 2026-11-20-pr392-research-safety-audit.md.
- **Remaining risk:** Low. A-957 is distinct from main and inspected open-PR incident filenames at publication; pending source-level Mac/Windows unpublished reservations still require reconciliation before merge.
