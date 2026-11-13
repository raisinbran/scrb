# Final pass: punctuation and speaker labels (findings, 2026-11-13)

AMI data only (ES2004a, IS1009a, TS3003a; 5-minute clips plus one full meeting). No owner recordings. Nothing in the app was changed.

## Punctuation: not reproduced

`parseWords` (`packages/transcription/src/whisper.ts`) keeps whisper's text as is, and nothing after it removes punctuation (`assemble`, `dropRoomEcho`, `toModelReplacement`, storage, the main-process contract mapping all pass `text` through).
On ES2004a 5 min through the real whisper settings (`-ml 1 -sow`, large-v3-turbo q5_0, VAD):

| Prompt (hint)                                                | Words     | With punctuation |
| ------------------------------------------------------------ | --------- | ---------------- |
| none                                                         | 403       | 68               |
| 10 lowercase terms (`eval-vocab/hint.txt`)                   | 399       | 47               |
| 40 invented capitalised terms                                | 397       | 82               |
| 20 lowercase terms                                           | 404       | 90               |
| "Glossary: ... ." / "This is a meeting. Terms we use: ... ." | 394 / 395 | 88 / 80          |

So the pipeline keeps punctuation, and a vocabulary hint does not remove it on AMI. Untested: the owner's actual audio (laptop speakers into the mic) and the owner's actual hint terms. Two things to check with the owner: whether any vocabulary terms are enabled (the hint is only sent then, `-mc 128 --carry-initial-prompt`), and whether the text seen is the live pass (live segments are shown until the final pass replaces them).

## Speaker labels: what the final pass does

- Meeting track: sherpa-onnx pyannote segmentation 3.0 (int8) plus 3D-Speaker ERes2Net embedding, agglomerative clustering at distance threshold 1.0 (`OVERSPLIT_THRESHOLD`), then `decideSpeakers`: clusters under 13 s of speech (`minSpeakerMs`) are absorbed into the most similar big cluster, and big clusters merge when cosine similarity is at least 0.65 (`mergeLine`).
- Mic track: every word is "You"; it is not diarized.
- Each meeting word takes the speaker span it overlaps most (nearest span if none). The final pass labels replace the live labels.

## Measured (windowed DER, 0.25 s collar, `scripts/eval/score_der.py` logic)

Full ES2004a (17 min): 4 speakers found, 4 real; DER 20.3% = miss 17.2%, false alarm 0.9%, confusion 2.2%.

Clips (ref speakers 4 each): speakers found / DER / confusion / miss at the current settings (threshold 1.0, min 13 s, line 0.65):

| Clip              | Found | DER   | Confusion | Miss  |
| ----------------- | ----- | ----- | --------- | ----- |
| ES2004a 60-360 s  | 2     | 17.9% | 1.4%      | 16.4% |
| ES2004a 600-900 s | 4     | 11.6% | 2.1%      | 8.4%  |
| IS1009a 0-300 s   | 3     | 23.4% | 11.7%     | 6.9%  |
| TS3003a 300-600 s | 1     | 18.5% | 0.3%      | 17.4% |

Findings:

1. Speaker confusion is low on three of four clips. The main error is missed speech (7-17%), which comes from the segmentation model, not clustering.
2. Short or lopsided recordings lose quiet speakers: in ES2004a 60-360 s two real speakers talk 6 s and 9 s, under the 13 s minimum, so they fold into the others. Lowering the minimum to 5 s found a third speaker there but raised DER by 0.7 points.
3. Sweeps (min 13 s / 5 s, `mergeLine` 0.65-0.9, sherpa threshold 1.0 / 0.7 / 0.5) gave no setting that helps every clip. The best single result, IS1009a with threshold 0.7: DER 23.4% to 16.1%; the same setting made ES2004a 60-360 s worse (17.9% to 18.9%). Not safe to change on four clips.
4. Not testable here: the owner's conditions (remote participants played through speakers into a laptop mic, compressed audio). The embedding model is the 3D-Speaker zh-cn model; a different embedding model would need an owner decision and a plan.

Recommendation: no tuning change. To go further, the owner would need to supply a test meeting that can be used (or a synthetic one with known speakers played through speakers), and the segmentation miss rate is the first thing to look at.
