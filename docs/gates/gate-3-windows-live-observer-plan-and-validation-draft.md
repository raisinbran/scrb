# Gate 3 Windows: Live-screen observer plan and owner validation checklist (DRAFT)

Status: **DRAFT, NOT_FROZEN, UNVALIDATED.** Written by Claude Code (Sonnet 5.5). Nothing here was run against the app. The validation in section 3 is not scored, freezes nothing and is not Gate 3 evidence. It is pending plan review by an agent other than the author.

Rules this serves: Protocol v3 section 1 (observer, validation items 1 to 6, polling straddle rule) and the matching rules. Input contract: `docs/handoffs/gate3-occurrence-matcher.md` on the Codex branch (matcher commit `437bbcc`), which reads `{"clock_basis":"harness","recording_sha256":...,"words":[{id,track,text,observed,u}]}`.

## 1. What was built (offline, unrun)

| File | Role |
| --- | --- |
| `scripts/gate3-retest/observe-live-v2.ps1` | Polls UI Automation under the element named `Live transcript` and writes raw JSONL (`SRCB-G3-OBSERVER-RAW-1`). Header: QPC frequency, origin QPC and UTC pair, pair gap. Each sample: QPC begin and end, the viewport rectangle read in that sample, and every named element with role, name, bounds, off-screen flag, and (with `-WordBounds`) per-word bounds from TextPattern. Read errors are logged as `error` lines and widen the next interval. Sends no input. Output file created new, no repeat. |
| `scripts/gate3-retest/observer_publications.py` | Turns the raw file into the matcher's publication file plus a report. Applies the visibility rule, builds word-position ids, keeps each position's first visible sample, computes `observed` and `u`, and compares hand-read screen-recording frames with the rule. Refuses to overwrite. |
| `scripts/gate3-retest/clock-overlay.ps1` | Separate always-on-top window showing seconds on the same QPC clock since a given origin, updated every 10 ms, for the screen recording. |
| `scripts/gate3-retest/test_observer_publications.py` | 23 offline tests on invented fixtures (see section 4). |

**Rules implemented**

- **Visible:** a word counts only if its bounds lie fully inside the viewport rectangle read in the same sample and its element is not reported off screen. If only paragraph bounds exist, the paragraph must be fully inside, and those words are marked `bounds_source: element`.
- **Stable word id:** `track|row time text|word index`, for example `microphone|0:05|3`. Track comes from the row's speaker label (`You` is microphone, `Meeting` is meeting; **[CONFIRM]**, overridable with `--label`). The id does not depend on screen position or scrolling. Two rows with the same track and time text in one sample are excluded and reported.
- **First visible only:** later polls of the same id are dropped. A later change of a position's text is listed under `text_revisions` and not published; the matcher cannot ingest revisions.
- **Time:** `observed` = sample end, in seconds on the harness QPC clock = (QPC ticks − harness origin ticks) / frequency. The harness log (`play-sources.ps1`) already records `qpc_ticks` and `stopwatch_frequency` from the same `Stopwatch`. A frequency mismatch is refused.
- **Uncertainty:** `u` = this sample's end − the previous successful sample's begin, which is the gap plus both read times. A failed sample is skipped, so it widens `u`. This is wider than the old reach probe, which used end minus the previous end. Largest `u` over 250 ms is listed. Words already on screen at the first sample are flagged `present_at_start`; their `u` runs from the observer origin and they are not counted as over the limit.
- **Not done by the observer:** the 100 ms marker fit and the harness-to-recording mapping stay in `marker_clock.py` and the matcher.

## 2. Screen-recording plan

- Record the screen region that holds the transcript pane and the clock overlay window, side by side, with Windows' built-in screen recorder (Snipping Tool video or Game Bar). **[CONFIRM]** the owner's PC has one; nothing may be installed.
- Start `clock-overlay.ps1` with the observer's `origin_qpc` (read from the first line of the raw file) so the overlay and the observer share one clock.
- Frame time reads to about one frame (17 to 33 ms) plus the overlay's redraw delay; that uncertainty is added when a frame fixes a sample time. Frames are extracted with the existing decoder tool and read by an agent or the owner; this is manual reading, not OCR.
- The recording is a backup that confirms what was in the viewport; UI Automation stays the primary source (Protocol v3, D7).

## 3. Owner-run VALIDATION checklist (not scored, under 20 minutes)

Planned: setup about 4 min, run 5 min, copy-back about 3 min, about 12 min in total. The app's own final processing after Stop is **not** included and is unmeasured; if it would push the total past 20 minutes, ask before starting. Use a fresh run folder and the pinned candidate `553dd9080f452f8a54ccff5cd5fea8d6937438ae`. Test audio only (the r3 assembled WAVs). Do not use any real meeting recording.

Folder for everything: `C:\Users\bchen\Documents\ChatGPT\srcb\gate3-v3-preflight-20261108\observer-validation-1\`. No administrator rights are needed for any step.

1. Apply the same Windows settings as the practice run (speaker volume 10, Realtek default output). Do not change any other setting.
2. Run `launch-candidate.ps1` check-only from `tools-d2-v2`; all hashes must match. Then run it with `-Launch -RunFolder <the new folder>\app-run`. In the app choose `CABLE Output` as the microphone, open the Live screen, and press **Record**. Write down the clock time.
3. In a Windows PowerShell 5.1 window run the observer for 300 seconds with word bounds on, using the app's process id (`-AppProcessId`, `-OutputFile <folder>\raw.jsonl`, `-Seconds 300`, `-ViewportName 'Live transcript'`, `-WordBounds`). Reading the first line of `raw.jsonl` gives `origin_qpc`.
4. In a second window run `clock-overlay.ps1 -OriginQpc <origin_qpc>`. Start the screen recording of the transcript pane and the overlay together.
5. Start the playback exactly as in the practice checklist (`play-sources.ps1 -Play -OwnerApprovedLongTest`, ready file first). Let it play about 4 minutes. Press Ctrl+C in that window to end it early; note that you did.
6. Visibility samples while both tracks speak. Do each with the mouse wheel on the transcript pane only; touch nothing else and say nothing:
   - minute 1: leave the pane following the live end for 30 s (samples 1 to 3 come from this stretch);
   - minute 2: scroll up about 3 screens, hold 10 s, press **Jump to Live** (scrolling samples 4 to 6);
   - minute 3: scroll up as far as the top and hold 10 s, then **Jump to Live** (older lines out of the viewport and, if the app removes them from the page, virtualized away; samples 7 to 9);
   - minute 4: scroll slowly down through lines 10 s and stop at the live end (sample 10).
   Write down the overlay time of each action.
7. Press **Stop** in the app. Stop the screen recording. The observer ends by itself at 300 s.
8. Copy back, read-only, into the folder: `raw.jsonl`, the screen recording, the playback log, your action times from step 6, and the Task Manager CPU and memory of the observer's PowerShell process and of the app at minute 2 (screenshot). Do not delete anything.

What I do with it (offline, no app): build the publication file, extract 10 or more frames at the overlay times, read the visible words, run the visibility comparison, and report largest `u`, largest read time and the overhead. PASS needs: UI Automation exposes the transcript text, labels and bounds; at least 10 frames agree with the rule including scrolling and virtualized cases; largest `u` of 250 ms or less; no truncated or hidden text.

## 4. Offline checks that exist

Schema keys and types, matcher acceptance of the output shape (run against matcher commit `437bbcc` with `SCRB_MATCHER_DIR`; skipped when absent), overwrite refusal, chronological output, id stability when a row moves, repeated words at distinct positions, same-time row exclusion, unknown labels ignored, first-visible time kept across scrolling out and back, per-sample viewport use, clipped and off-screen words, provisional-to-final revisions reported, interval arithmetic (gap plus both reads, failed samples widen, origin conversion, frequency mismatch), the 10-sample review comparison, and static guards that the scripts send no input, create output new, and use `Stopwatch` ticks. The two scripts parse with the PowerShell parser (no run).

## 5. What could NOT be verified without the app, and what each step needs from the owner

| Unverified | Why | Needs from the owner |
| --- | --- | --- |
| UIA exposes the transcript at all, and the element is named `Live transcript` | The pane is an Electron (Chromium) page; the name comes from `aria-label` in the source, but the exposed tree was never read | Run step 3; admin no; folder above; app yes |
| Rows appear as label, time, paragraph in document order | The adapter assumes this order from the source (`TranscriptRow.tsx`) | Same run |
| Word-level bounds through TextPattern work on this pane, and cost | Chromium may expose only paragraph text; read time under load is unknown | Same run (compare `-WordBounds` read times, or a second 60 s run without it); admin no |
| Word ids cannot come from the app: `data-word-id` and `data-segment-id` are DOM attributes that UIA does not expose, so ids use track plus the row's displayed time plus word index | Source reading only | Decision: accept this id, or ask for a UI/contract change (owner approval, handoff note) |
| Row time text unique per track, rows stay put when text is revised | Same-second rows are excluded, not resolved; a revised word count shifts later indices | The run shows how often `ambiguous_rows` and `text_revisions` occur |
| Speaker labels are `You` and `Meeting` | Protocol marks it [CONFIRM] | Read from the run |
| Older lines really leave the viewport or the page during 4 minutes | Rows are virtualized only beyond the viewport plus 6 rows of overscan; a short run may never reach that | The element counts per sample in `raw.jsonl`; a longer run needs a separate approval |
| Largest `u` of 250 ms or less under full load | Poll interval 50 ms is a setting, not a measurement; each read takes unknown time | Step 3 to 7 under the load of both tracks, recording and the screen recording |
| Observer and overlay share the harness QPC | Same `Stopwatch` ticks, same machine; never compared on a real run | The validation run shows both against one clock |
| Built-in screen recorder exists and its frame accuracy | Not checked | Owner names the tool; admin no |
| Screen-recording frame reading is accurate | Reading frames is manual, not independent OCR | Review of my frame reading by another agent or the owner |
| Observer CPU and memory overhead | Never measured | Step 8 screenshots |
| Behavior of the matcher on real observer output (revisions, rows that move words) | Matcher refuses conflicting text per id; the adapter publishes first-visible only | Codex review after the run |
| Review of this plan and code by an agent other than the author | Not yet done | Assign a reviewer before the owner run; automated comment checking is also still pending |

No file here is frozen. Hashes for the observer, adapter and overlay stay PENDING until review and the owner's approval.
