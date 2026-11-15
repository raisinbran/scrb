# Windows Gate 3 — preserved-recording final-pass recovery evidence

**Observed:** 2026-11-03, Pacific time. **Result:** PASS for final-pass completion and evidence integrity only. **Windows Gate 3: NOT APPROVED.**

**Candidate:** `e85eefed98298221cf921ba62f9b2e3e325a54bd`.  
**Machine:** Dell Precision 7760, Windows 11 Pro for Workstations (build 26300), Xeon W-11855M, 12 logical CPUs, 64 GB installed RAM. An NVIDIA RTX A3000 is installed, but the verified Whisper executable was built without CUDA/Vulkan/SYCL/Metal/BLAS acceleration and used CPU recognition with four threads. Sherpa's execution provider was not independently established.

## Why this recovery was needed

A previous final pass on the retained 2026-11-03 one-hour recording was interrupted after at least 69 minutes without publishing a completed final transcript. The reason the application exited was not established. No durable checkpoint for recognition/speaker processing was identified, so this attempt was expected to recompute from the beginning.

The original recording library was never opened during preparation or recovery. A physically independent, verified working copy was opened in a dedicated Electron profile, launched by the owner from a normal Windows PowerShell session, independent of Codex/Playwright/disposable sessions. The required capture helper and final-pass configuration were verified before launch; `SCRB_LIVE_CONFIG` was unset. No new audio was recorded.

## Completion and integrity

| Observation | Verified result |
| --- | --- |
| Recorded duration | 3,623.194 s (60m 23.194s) |
| Application launch to first observed `ready` | 4,577.501 s (76m 17.501s) |
| First observed final worker to `ready` | 4,543.842 s (75m 43.842s) |
| Timing resolution | Approximately 5 s status polling; neither duration isolates inference-only processing |
| Completed meeting status | `ready` |
| Microphone final words / segments | 7,360 / 4,815 |
| Meeting final words / segments | 7,607 / 4,904 |
| Total final words | **14,967** |
| Invalid final-word timings | **0** |
| Maximum **sampled** process-tree working set | 1,973.207 MiB, over 151 samples; not a true peak |
| Original library unchanged after run | **PASS** |
| Working-copy recorded audio unchanged | **PASS** |
| Final completion verification failures | **0** |
| Application closed by monitor | **No** |

Preparation independently verified 1,463 source/copy files with matching SHA-256 inventories, including all 1,453 original audio chunks (726 microphone and 727 meeting). SQLite integrity and foreign-key checks passed on a disposable database copy. Exactly one intended `finalPassRunning` job was pending. At completion, the transcript validator checked for nonzero final words on both tracks, finite/nonnegative word timing, unchanged saved duration, and preserved audio. This records a successful recovered final pass; it does **not** make a claim about transcript accuracy.

## Acceptance boundary and next checks

- **Final-pass completion blocker:** resolved for this preserved recording and candidate.
- **Final-pass time threshold:** not demonstrated. Launch-to-ready was about 1.26× recorded duration with CPU Whisper. The development plan specifies no longer than recording duration on a GPU-capable configuration; this CPU execution does not establish that threshold.
- **Final-pass accuracy:** still requires reference-based WER comparison showing at least 15% fewer word errors than the live pass. Final word counts are **not** a WER measurement.
- **Other Windows Gate 3 requirements:** calibrated live transcription delay with both tracks busy, recording activation, endurance, imports/cancellation, and any remaining integrated acceptance checks must be evaluated separately. This note does not waive or approve any of them.

## Private evidence and retention

The owner retains the full local evidence under the private folder named `gate3-final-recovery-prep-20261103`, notably `owner-attempt/outcome.json`, `completion-verification.json`, `original-after.json`, `start.json`, `memory.jsonl`, and `status.jsonl`. The preserved source recording and its verified working copy remain private. Exact local paths and sensitive recordings/transcripts are intentionally **not** included in this repository.

Follow [Gate test evidence retention](evidence-retention-policy.md): do not delete substantive Gate 3 evidence before approval, and do not automatically delete it afterward without the owner's explicit authorization.

**Provenance:** These measurements were extracted from the owner's retained recovery-attempt summaries, not from GitHub CI; the recovery run was performed on physical Windows hardware. No app code, test criteria, or Gate 3 approval is changed by this note.
