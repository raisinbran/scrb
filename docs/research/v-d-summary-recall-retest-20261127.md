# V-d Gate 6 summary-recall retest — 2026-11-27

**Outcome: comparison not run; no prompt or pipeline change is proposed for acceptance.**

The frozen public AMI baseline remains:

| Meeting | Recovered / reference items | Recall before | Recall after |
| --- | ---: | ---: | ---: |
| IS1004d | 5 / 12 | 41.7% | NOT RUN |
| ES2015c | 11 / 13 | 84.6% | NOT RUN |
| TS3005b | 11 / 15 | 73.3% | NOT RUN |
| **Total** | **27 / 40** | **67.5%** | **NOT RUN** |

The deterministic Gate 6 scorer was not run on a candidate output. The clean clone was at `adec7d0a114f6f5f203ba35450d3515ca584dae6`. Dependency installation completed in the isolated clone with Node 22.23.4 and npm 10.9.9. Setup inspection found no `llama-server.exe` or `Qwen3.5-9B-Q4_K_M.gguf` in the documented `scrb-dev-assets` locations, and no prepared meeting transcript/reference files in the clone, original repository's expected fixture directory, or searched summary-test temp directories. No model was downloaded or built, no fixture was generated, and no transcript contents were read during setup.

The original diagnosis in PR #519 identifies 13 baseline misses and proposes testing settled-coverage wording, while classifying most item-level causes as provisional. Without the exact model/runtime and public fixture inputs, an after-score cannot establish whether that change improves recall without worsening a meeting. The baseline numbers are preserved here; no code change or Gate 6 acceptance is claimed.