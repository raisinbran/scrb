# Performance settings (plan, no code)

Status: **Draft. Needs the owner's approval, and independent review (ChatGPT via the owner) is pending.** It touches Settings, IPC and `packages/contracts/`, so nothing is built until both.

## In short

A colleague finds live transcription heavy on CPU, GPU and memory. The app should pick sensible load for each PC and let the user override it. Recommendation: **not M1**. The owner's Mac (Apple M5, 10 cores, 16 GB) runs live and final passes today. Do the small, contract-free first step after M1 and the benchmark after that (section 4).

## 1. What scales with hardware today

| Knob                                       | Where                                                                                                                                                                                                                                                     | Today                                                                                                                                      |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Live text on or off                        | `backend.ts`: live runs only if `SCRB_LIVE_CONFIG` is set (dev builds only)                                                                                                                                                                               | A dev-environment switch, not a setting                                                                                                    |
| Live model, threads, GPU, audio context    | `readLiveSetup` (`live-feed.ts`) reads `whisper.{threads,audioContext,useGpu,language}` from the live config file. `LiveWhisper` (`whisper.ts`) defaults to 4 threads, GPU on, full context                                                               | Fixed by the owner's file. `config.ts` notes small.en-q5_1 with `-ac 768` for CPU-only PCs, turbo on GPU PCs. Nothing chooses between them |
| Live speaker threads                       | `livePass.ts` `sherpaThreads`, default 4                                                                                                                                                                                                                  | Fixed                                                                                                                                      |
| Final-pass model                           | `ModelPaths.speechFinal`, large-v3-turbo-q5_0                                                                                                                                                                                                             | Fixed. One model ships                                                                                                                     |
| Final-pass threads, GPU                    | `finalPass.ts` `threads` default 4, `useGpu` unset (on). `createFinalPassRunner` (`app-core/final-pass.ts`) does not pass either                                                                                                                          | Fixed                                                                                                                                      |
| Sherpa (speaker) threads in the final pass | same `threads`                                                                                                                                                                                                                                            | Fixed at 4                                                                                                                                 |
| Concurrency                                | `FinalPassQueue` runs one meeting at a time. `ImportCoordinator` stops for a recording and shares the queue. Stages run one after another, so one large model is loaded at a time. A recording runs live whisper plus the capture helper at the same time | Already serial                                                                                                                             |
| Summary model                              | `summary/worker.ts`: `-ngl 99`, 4 threads                                                                                                                                                                                                                 | Fixed, out of scope here                                                                                                                   |

Settings storage: `createSettingsHandlers` (`app-core/settings.ts`) keeps one JSON value under `app.settings` in the library index, merges patches, fills `DEFAULTS`, and drops a saved value that fails `isValidRequest('updateSettings')`.

Contract today: `AppSettings` has `transcriptionQuality: 'fast' | 'balanced' | 'accurate'` (default `balanced`), and `SettingsScreen.tsx` shows it as "Transcription quality". **Nothing in the backend reads it.** It is a dead control. There is no live on/off, performance or hardware field.

Out of scope: whisper `-mc` (prompt context). That is a quality versus repeated-text trade-off, not a hardware one.

## 2. Smallest useful design

### 2.1 Reuse the existing preset

Keep `transcriptionQuality` as the preset and wire it. Rename the label to "Performance" in the UI only: Fast / Balanced / Best quality. Presets change only knobs that already exist. No new model ships.

|                                    | Fast                                                | Balanced                     | Best quality                                                |
| ---------------------------------- | --------------------------------------------------- | ---------------------------- | ----------------------------------------------------------- |
| Live text                          | Off (text appears after Stop)                       | On, small.en-q5_1, `-ac 768` | On, large-v3-turbo if eligible (see 2.1a), else as Balanced |
| Live whisper threads               | n/a                                                 | clamp(floor(cores/2), 2, 4)  | clamp(cores-2, 2, 8)                                        |
| Live speaker threads               | n/a                                                 | 2                            | 4                                                           |
| Final threads (whisper and sherpa) | clamp(floor(cores/4), 2, 8), so the PC stays usable | 4 (today)                    | clamp(cores-2, 2, 8)                                        |
| GPU                                | on if present                                       | on if present                | on if present                                               |

Plus a separate "Live text while recording" switch, so a user can turn the heaviest part off under any preset. This replaces today's dev-only environment switch. The switch is the actual fix for the colleague's complaint. Every thread count is an integer: `floor` for halves and quarters, then `clamp(n, lo, hi)`, so 1, 3, 5, 7 and 9 cores give whole numbers inside 2 to 8 (the live-config loader accepts integers from 1 to 64 only). Thread counts are provisional until measured on the owner's Mac (section 3).

Hardware facts come from Node (`os.cpus()`, `os.totalmem()`, arch, platform). GPU presence: Metal on Apple silicon; on Windows, unknown without a probe, so the benchmark's measured speed decides, not a GPU name.

### 2.1a Live model choice, precedence and fallback

The resolver also picks the live model path, because `LiveSetup.models.speechLive` is set separately from the whisper options. The live config file gains an optional `models.speechLiveAccurate` (turbo). Eligible for Best means: that file exists, a GPU path is likely (Apple silicon, or a passing benchmark with live RTF at or below 0.4), and live text is on. Otherwise Best uses `models.speechLive` as Balanced does.

Order of precedence, highest first: (1) a deliberate developer override: the environment variable `SCRB_LIVE_MODEL`, or the new live-config key `whisperOverride: true` that marks the file's `whisper.*` values and `models.speechLive` as forced (today's behaviour for anyone who sets it); (2) the resolver's choice from preset, switch and hardware, where the file's `models.speechLive` is only the **baseline** model (the one `readLiveSetup` already requires in every valid config) and `models.speechLiveAccurate` is the upgrade; (3) built-in defaults. Without an override, Best with both models present picks the accurate one. The file's `whisper.threads`, `useGpu`, `audioContext` and `language` are likewise baselines unless the override is set; `language` is never changed by the resolver. A missing or unreadable model file falls back one step (turbo → small.en → live off with a visible note), never to a crash. The resolved choice is logged at recording start.

### 2.2 Recommendation without a benchmark (step 1)

A fixed rule, no timing: under 8 GB RAM or fewer than 4 cores → Fast. 8 to 15 GB → Balanced. 16 GB or more with 8 or more cores → Balanced (Best quality is never the default, because it is the heaviest and the gain is unmeasured). The recommended option is marked "(Recommended for this PC)". New installs start on it. Existing saved choices are never changed.

### 2.3 Short benchmark (step 2)

A "Check this PC" button in Settings. It:

1. Refuses to start while a recording, final pass or import is running, and says why.
2. Transcribes a 30 s clip with the live model, then with the final model, using the same tools and thread counts a real run would. It records the real-time factor (RTF = processing time ÷ audio time) and peak memory.
3. Runs at below-normal priority, with a visible Cancel, and under a 90 s cap. A timeout is reported as "this PC is slow", not as an error.
4. Recommends: live RTF ≤ 0.4 → live text on (a recording has two tracks, so headroom is needed); final RTF ≤ 1.0 → Balanced or Best; otherwise Fast with live off. **Thresholds are provisional**; calibrate on the owner's Mac and, when available, the Windows PCs before shipping (owner decision 3).
5. Saves the result (date, RTF values, recommendation) with the settings, and shows "Checked 13 Nov. Recommended: Balanced, live text on."

The clip is read-only app data, not a recording. It is an AMI excerpt (CC BY 4.0, credit shipped with the app) or a synthetic clip (owner decision 2). Never the owner's meetings.

### 2.4 Where it appears

Settings → "Transcription and summaries" section, replacing "Transcription quality":

- Performance: select, recommended option marked.
- Live text while recording: switch.
- Check this PC: button, last result line, Cancel while running.
- Plain note under the controls: "Live text uses the most processor and memory. Turning it off does not change the final transcript."

### 2.5 Contract fields (proposal only; `packages/contracts/` is not edited)

Step 1 needs one field. Step 2 adds the rest.

- `AppSettings.liveTranscription: boolean` (+ validator entry, default from 2.2). _Step 1._
- `AppSettings.performanceCheck: { checkedAt: string; liveRtf: number; finalRtf: number; recommended: TranscriptionQuality; recommendedLive: boolean } | null`, read-only to the UI (`SettingsPatch` omits it), written only by the benchmark handler. _Step 2._
- New call `runPerformanceCheck: { request: void; response: AppSettings['performanceCheck'] }` and `cancelPerformanceCheck: { request: void; response: void }`; refused with the existing error shape while busy. Progress optional (a spinner is enough). Both names must be added to the preload and main allowlists. _Step 2._
- `transcriptionQuality` keeps its type; only its meaning and UI label change.
- Mock backend must match, including the developer menu: a fake slow PC and a fake fast PC.

Main-process side: a resolver turns (preset, switch, hardware) into `LiveSetup.whisper`, `FinalPassOptions.threads` and sherpa threads, replacing the values `readLiveSetup` takes from the config file. File values stay as the dev override. The live worker reads its options when a recording starts, so a change applies to the next recording; the UI says so.

## 3. Risks and tests

| Risk                                                   | Handling                                                                                                                                                                                                                                         |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Benchmark disturbs a recording                         | Refuse while recording, processing or importing; start of a recording while the check runs cancels the check first (the same way imports stop for a recording). Test: start a recording mid-check; the check ends and the recording starts clean |
| Heat and battery (benchmark and Best quality)          | Check is under 90 s. On battery, warn before starting. Fast preset and the live switch are the user's relief                                                                                                                                     |
| Results vary run to run and with background load       | Recommend only; never auto-switch. Run the live clip twice and use the slower; show the date; "Check again" is one click. Treat borderline results as the lower preset                                                                           |
| Fast live-off surprises someone who expected live text | Label says text appears after Stop. The Live screen already handles no live segments (test it)                                                                                                                                                   |
| Wrong thread count starves the UI or capture           | Caps above; capture and UI keep priority. Test under load                                                                                                                                                                                        |
| A saved or damaged value                               | The existing validator drops it and defaults apply. Test: old settings without the new fields                                                                                                                                                    |
| Dead control stays dead                                | A unit test fails if any preset does not change the resolved options                                                                                                                                                                             |
| Packaged builds                                        | Live and final pass are dev-only today (`app.isPackaged`), so the benchmark cannot run packaged until installer resources ship (`task-30-installer-resources.md`)                                                                                |

Tests, all generated or AMI data, each under 20 minutes total:

1. Unit: resolver table (presets × core counts including odd ones: 1, 2, 3, 5, 7, 9, 10, 12 × RAM × platform), every thread count an integer inside its clamp; live switch off builds no live setup; Best picks `speechLiveAccurate` when eligible and `speechLive` when the file is missing, the GPU path is unlikely or live is off; a deliberate override (env var or `whisperOverride`) beats the resolver; Best with both models present and no override picks `speechLiveAccurate`; with only the baseline file it uses `speechLive`; a missing model falls back as in 2.1a.
2. Unit: settings merge with the new fields, old settings, invalid values.
3. Unit: benchmark decision function from fixed RTF numbers, including borderline and timeout.
4. Unit/integration: refusal while recording, cancel, start-recording-during-check, with a stub whisper that sleeps.
5. UI: Settings states (recommended mark, switch, running, result, error) on the mock backend, fast and slow.
6. One real run on the owner's Mac: the 30 s clip, live and final, about 2 to 3 minutes. Compare Fast, Balanced and Best by measuring wall time and CPU on one AMI 5-minute excerpt (about 15 minutes in all). Record the numbers that fix the thresholds. No owner recordings.
7. `npm run check` and `npm run test:smoke`.

## 4. M1 or after?

**After M1.** M1 is a usable app for real meetings on the owner's Mac, which handles live and final passes today. The need comes with a second user's machine. The benchmark also needs packaged tools and models.

Suggested order, each its own owner-approved step:

1. **Before sharing the app with the colleague (small):** live on/off setting, a resolver that makes the existing dropdown real, and the fixed recommendation rule. One contract field (`liveTranscription`). Meanwhile the dead "Transcription quality" control misleads, so either hide it until step 1 lands or accept it for M1 (owner decision 4).
2. Benchmark and `performanceCheck`, after installer resources ship.
3. Calibrate thresholds on the Windows PCs when they are available.

## 5. Owner decisions

1. Approve the approach: reuse `transcriptionQuality`, add the live switch, benchmark later. Approve the contract fields in 2.5 (step 1: one field; step 2: the rest).
2. Benchmark clip: AMI excerpt with credit, or a synthetic clip.
3. Thresholds: accept provisional values now and calibrate on the Mac, or wait for the Windows PCs.
4. Until step 1 lands: hide the unwired "Transcription quality" control in M1, or leave it.
5. Whether "Best quality" may ever be the recommended default (this plan says no).
