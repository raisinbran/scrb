# Vocabulary Gate 5, Stage 1a: preflight, hint-off run, download list

**Date:** 2026-11-12. **Base:** `origin/main` `62d9f2a` (HEAD of this branch). Plan: [vocabulary-gate5-evaluation.md](../plans/vocabulary-gate5-evaluation.md) steps 1 and 3, plus the list for step 2. Nothing downloaded, no audio played, no product code changed, AMI fixtures only. Stage 1 steps 2 and 4 to 8 are **not done** and wait for the owner.

## Preflight (step 1)

| Item | Result |
| --- | --- |
| TS3003a wav | `~/scrb-dev-assets/downloads/ami/TS3003a.Mix-Headset.wav`, 48,180,608 bytes = 1506 s (25.1 min) |
| References | `downloads/ami/ann/words/TS3003a.{A,B,C,D}.words.xml` present (687 words files, 171 meetings) |
| Models | `models/whisper/ggml-large-v3-turbo-q5_0.bin` (574,041,195 B), `ggml-silero-v6.2.0.bin` present |
| `whisper-cli` | `upstream/whisper.cpp/build/bin/whisper-cli` present; whisper.cpp commit `284029c07012d2000941a08d38a31ffb71f4734e` (matches `scripts/dev-assets.sh`) |
| Repo HEAD | `62d9f2a4edbee94d35c7f591784ab707d2c54001` |
| Machine | 10 CPUs (4 performance cores); free disk 149 GiB |
| Threads | The app's final pass defaults to `-t 4` (`packages/transcription/src/finalPass.ts:64`); the run used 4. GPU was left at the default (Metal use not separately confirmed from the log). |

All paths match the plan. Nothing missing.

**Turbo finding (resolves one unverified item):** `ModelPaths.speechFinal` is documented as "large-v3-turbo-q5_0, the final-pass model" (`packages/transcription/src/config.ts:14`). `finalPass.ts:84` passes `models.speechFinal` as `-m`; `wholeFileArgs` (`whisper.ts:46`) adds `--vad`, `-mc 0`, `-ml 1 -sow`, `-ojf`, `-np -pp`, and `--prompt <hint> --carry-initial-prompt` only when a hint is given. Both dev scripts (`e2e-ami.ts`, `m1-joins.ts`) map `speechFinal` to the turbo file. Still unverified: which file the installed desktop app resolves at runtime (the model-path wiring in `apps/desktop` was not traced; `live-feed.ts` sets it to `''`, as it is not used live).

## Hint-off run (step 3)

- Command (recorded in `~/scrb-dev-assets/eval-vocab/command-log.md` and `off/cmd.txt`): `wholeFileArgs` flags without the two prompt flags: `-m <turbo> -f <TS3003a wav> -t 4 -l en --vad --vad-model <silero> -mc 0 -ml 1 -sow -ojf -of .../eval-vocab/off/TS3003a -np -pp`.
- Run once, exit 0, **about 24 s** wall for 1506 s of audio: **real-time factor about 0.016** (about 63x faster than real time).
- Output: `~/scrb-dev-assets/eval-vocab/off/TS3003a.json` (1.0 MB, 2090 entries; first lines read as correct English, no scoring yet). Outside git.
- **Effect on the plan:** the plan's estimate was 0.25 to 1.4x real time. Measured is far faster, so Stage 1 decoding of about 4 audio-hours is on the order of 4 to 5 minutes, not 1 to 5.5 hours. One file, one run: re-measure on the longer files. If it holds, the Stage 1 duration estimate (2.5 to 7 h) is dominated by downloads and scoring, and the 20-minute approval question should be re-asked with the real figure.

## Negative-control download list (step 2; nothing fetched)

Method: for each local AMI meeting, count occurrences of TS3003a's distinctive words (appear at least twice in TS3003a, in under 20% of the 171 meetings, longer than 3 letters; 36 words, for example width, animal, undo, bart, garfield, sheep, recorder, waterproof, microphones, skinny) in that meeting's reference words. Chosen meetings have **0 hits**. Caveat: this is a word-count proxy; the real learned terms are only chosen in step 4. Remember that all `ES`, `IS` and `TS` meetings are the same remote-control design scenario, so most share some domain vocabulary; `EN2002d` is a non-scenario meeting.

Source (the same mirror `scripts/dev-assets.sh` uses): `https://groups.inf.ed.ac.uk/ami/AMICorpusMirror/amicorpus/<ID>/audio/<ID>.Mix-Headset.wav`. Sizes are HTTP HEAD `Content-Length` (all returned 200); durations are `meetings.xml` values (size / 32,000 B/s agrees within seconds). Words files for the references are already local.

| File | Type | Duration | Size |
| --- | --- | --- | --- |
| ES2003c.Mix-Headset.wav | scenario | 2251 s (37.5 min) | 72,221,740 B |
| ES2014b.Mix-Headset.wav | scenario | 2319 s (38.7 min) | 74,236,632 B |
| ES2016c.Mix-Headset.wav | scenario | 2308 s (38.5 min) | 73,868,674 B |
| EN2002d.Mix-Headset.wav | non-scenario | 2209 s (36.8 min) | 70,716,802 B |
| **Total** | | **9087 s = 2.52 h** | **291,043,848 B (about 278 MiB)** |

Reserve (also 0 hits, HEAD ok): ES2015c (2135 s, 68,348,632 B), TS3012c (2376 s, 76,047,062 B), IS1007c (2100 s, 67,622,759 B).

**Shortfall:** with local ES2004a (17.5 min) and IS1009a (14.0 min), the four files give about 3.05 audio-hours, under the plan's 3.2 h. Adding ES2015c reaches about 3.4 h (+68.3 MB). Owner decides; recommend including ES2015c. Local ES2004a and IS1009a were not checked against the distinctive-word list in this note.

## Unverified

Runtime model path of the installed app; run-to-run determinism; whether Metal GPU was active in this run; the distinctive-word proxy vs the real term list; whether decoding speed holds on the other files. Hint-off output has not been scored or compared with the reference.

## Proposed usage row

Appended to `agents/agent_task_allocation.md` (Claude Code / Sonnet 5.5 / Mac; 5h remaining 95% -> 94%, weekly 27% -> 27%; clock times unavailable). No self-induced failures to log.

## Download done (step 2), owner-approved in chat 2026-11-12

Fetched with `curl` from the mirror above into `~/scrb-dev-assets/eval-vocab/neg/` (outside git). Sizes equal the earlier HEAD values exactly. `ffprobe` is not on PATH here, so durations were read from the WAV headers (Python `wave`); all files are 16 kHz, mono, 16-bit PCM. No anomalies.

| File | Size (B) | Duration | SHA-256 |
| --- | --- | --- | --- |
| EN2002d.Mix-Headset.wav | 70,716,802 | 2209.9 s | 6aa99d9d71cb695ea699d6be277f78eff68e847c93560031486eba9f18164ebe |
| ES2003c.Mix-Headset.wav | 72,221,740 | 2256.9 s | 828faf52f14ae584c299c35009fa519b4780bfcc2c966288eebb6af091ef0fd7 |
| ES2014b.Mix-Headset.wav | 74,236,632 | 2319.9 s | 472969899eb229d56e4c68576dd641afecae1a2300591d3be1c8561f6a41d79d |
| ES2015c.Mix-Headset.wav | 68,348,632 | 2135.9 s | 50999075fa47769474ecb2b39629db674f0b2a33ca5368df6af07ea106253dcb |
| ES2016c.Mix-Headset.wav | 73,868,674 | 2308.4 s | 8885f3d72b9f15b20002ef15491545af7c7339e650f9b245cfb8d7fc5f8c20a0 |

New files: 11,231 s = 3.12 h; with local ES2004a and IS1009a, about 3.64 h of negative controls (plan target 3.2 h met). References are the local `ann/words/` files. Steps 4 to 8 not started.
