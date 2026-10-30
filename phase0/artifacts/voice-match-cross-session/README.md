# Voice-match confidence line across sessions

Claude Code, 2026-10-29, on the Apple Silicon Mac (background priority, 2
onnxruntime threads, during the 8-hour capture test).

## Method

`scripts/voice_match_cross.py`, eres2net (zh) embedding via sherpa-onnx, the
same single-speaker AMI stretches (at least 1.5 s, no overlap) as
`scripts/voice_match.py`.  Three AMI scenario series, each four meetings (a-d)
with the same four people: ES2004, IS1009, TS3003 (12 speakers, Mix-Headset).
People are matched across meetings by AMI `global_name`, not the per-meeting
letter.

- **a -> b,c,d**: profile = mean of all the speaker's segments in meeting a;
  every segment of meetings b, c and d is a test (2,055 tests).
- **a+b -> c,d**: profile also includes meeting b (updated once); tests are
  meetings c and d (1,407 tests).

Every test is scored against all 12 profiles.  "Known named wrong": the best
profile is above the threshold but belongs to someone else.  "Stranger named
wrong": the true speaker's profile is withheld, and any profile above the
threshold counts as wrong.  Rates are shares of all tests (2% of 2,055 is
about 41 segments).

## Results

| Condition | Threshold | Known auto-named | Known named wrong | Stranger named wrong |
| --- | ---: | ---: | ---: | ---: |
| a -> b,c,d | 0.45 | 94.1% | 0.7% | 6.6% |
| a -> b,c,d | 0.50 | 90.0% | 0.3% | 1.5% |
| a -> b,c,d | **0.55** | **83.8%** | **0.1%** | **0.2%** |
| a -> b,c,d | **0.60** | **74.0%** | **0.0%** | **0.0%** |
| a -> b,c,d | 0.65 | 61.6% | 0.0% | 0.0% |
| a+b -> c,d | 0.45 | 95.5% | 0.3% | 7.5% |
| a+b -> c,d | 0.50 | 92.3% | 0.1% | 1.8% |
| a+b -> c,d | **0.55** | **87.8%** | **0.1%** | **0.4%** |
| a+b -> c,d | **0.60** | **80.8%** | **0.0%** | **0.0%** |
| a+b -> c,d | 0.65 | 71.4% | 0.0% | 0.0% |

For comparison, within one meeting (`gate-0.md`): 0.55 gave 86.6% / 0.0% /
1.8%, and 0.60 gave 77.4% / 0.0% / 0.0%.

Across sessions the auto-named share drops by about 3 points (a -> b,c,d), and
wrong matches stay well under 2%.  At 0.55 there are 2 known-speaker mistakes
out of 2,055 (scores 0.571 and 0.574) and 4 stranger mistakes; at 0.60 there
are none.  The highest wrong score in either error mode is below 0.60.
Updating the profile with a second meeting raises auto-naming at 0.60 from
74% to 81% without adding errors.

Per meeting (a -> b,c,d), auto-named at 0.55 / 0.60: b 87% / 81%, c 88% / 80%,
d 78% / 63%.  The later meeting d clears the line least often.  At 0.55,
wrong matches stay under 1% in every meeting and series in both conditions
(the worst is IS1009 strangers in a+b -> c,d, 0.8%); at 0.60 they are 0%
everywhere.

### Weak profiles

Auto-naming varies a lot by speaker.  The three speakers with only 4--5
enrolment segments in meeting a are named much less often (FIO087, with 8,
was fine at 93%):

| Speaker | Enrolment segments (a) | Tests | Auto-named at 0.55 | at 0.60 |
| --- | ---: | ---: | ---: | ---: |
| MTD0010ID | 5 | 74 | 48.6% | 21.6% |
| MTD011UID | 5 | 105 | 63.8% | 44.8% |
| FIO084 | 4 | 111 | 64.0% | 55.0% |
| MEE014 | 19 | 195 | 76.4% | 62.1% |
| other 8 speakers | 8--95 | 1,570 | 84--93% | 75--88% |

Five of the seven known-speaker mistakes at 0.50 involve MTD0010ID (5
enrolment segments), who is mistaken for MTD009PM in the same room.  The one
outlier, FEE013 named as MEO015 at 0.571 in ES2004c, scores only 0.25 against
their own profile, which points to crosstalk or a labelling slip in that
stretch rather than a voice confusion.

## Conclusion

The provisional line **0.55--0.60 holds across sessions**: both ends meet the
under-2% wrong-match target for known speakers and strangers in both
conditions.  0.60 had zero wrong matches in 3,462 cross-session tests at a
cost of about 10 points of auto-naming against 0.55 (in either condition).  0.50 is too low for
strangers (1.5--1.8%, at the limit).

Suggested refinement for Phase 4: keep the line at 0.55--0.60, and do not
auto-name from a profile built from only a handful of segments (here 4--5
stretches, well under a minute of speech); suggest instead until the profile
has grown.  The minimum enrolment amount still needs measuring.

## Limits

- All four meetings of an AMI series were recorded on the same day, in the
  same room, with the same headset mix.  This is across sessions, not across
  days, rooms or microphones (a laptop mic on a later day will score lower).
- The stranger pool is only the other 11 speakers; a larger population raises
  the chance that some impostor clears the line.
- Segments are clean reference stretches of at least 1.5 s; live diarization
  segments are noisier.

## Files

- `voice_match_cross.json`: tables per condition, by meeting letter, by
  series and by speaker; enrolment counts; score quantiles; known-speaker
  mistakes at 0.50.
- `voice_match_cross.txt`: console output.
- `*.segments.txt`: the single-speaker stretches embedded.  The embeddings
  (`*.embeddings.txt`, ~15 MB) are git-ignored; meeting-a embeddings are
  identical to `artifacts/voice-match/3dspeaker/`.

Reproduce (from `phase0/`, after `scripts/fetch-phase0-deps.sh ami` and
`ami-series`, and `probes/live-diarization/build.sh`):

```
LIVEDIARIZE_THREADS=2 taskpolicy -c background python3 -I scripts/voice_match_cross.py \
  probes/live-diarization/LiveDiarize \
  models/sherpa-onnx/sherpa-onnx-pyannote-segmentation-3-0/model.onnx \
  models/sherpa-onnx/3dspeaker_speech_eres2net_base_sv_zh-cn_3dspeaker_16k.onnx \
  downloads/ami artifacts/voice-match-cross-session ES2004 IS1009 TS3003
```
