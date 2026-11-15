# Speaker separation on the owner's newest real meeting (2026-11-14)

Aggregate numbers only; no audio, text or quotes. The owner permitted reading this one meeting (a 4 min 6 s recording, newest in the library). Work was in scratch copies, deleted afterwards. The library was only read. Ground truth is not known (nobody listened), so "separates" below means the pipeline outputs two speakers, not that the split is right.

## What the app did

Final-pass log line for this meeting: 2 raw clusters (86 s and 5 s of speech), closest raw similarity 0.48, merge line 0.65, short-speaker floor 10 s, short guard 0.4, result 1 speaker. The meeting track holds about 91 s of detected speech (one remote "speaker" turn set of 270 words); the mic track is the owner.

## Which rule merged them

1. **Not the merge line.** 0.48 is under 0.65.
2. **The short-speaker rule absorbed the second cluster**: 5 s is under the 10 s floor, so it is always absorbed. Lowering the floor to 5 s still absorbs it (similarity 0.48 is at or above the 0.4 guard).
3. **That rule may not be the whole story.** The smaller raw cluster has 6 segments of 2 s or less; the larger has 28 segments (longest 11.2 s). Which people these clusters correspond to is not known (no ground-truth labels). Sherpa threshold 0.5 to 1.1 never produces a second cluster over 9 s (up to 11 clusters at 0.5, largest still 68 s, others 0.4 to 6 s each); 1.2 gives one cluster.
4. **The embedding barely tells the voices apart.** In the big cluster, 20 embedded spans have pairwise similarity min 0.21, median 0.55, max 0.87. Splitting them in two (2-means) gives groups of 8 and 12 spans (24 s and 56 s) whose centroids sit at 0.76, above the 0.65 merge line, with weak within-group similarity (0.53 and 0.69). This is consistent with an embedding that separates this voice poorly, but that is an **unverified hypothesis**: there are no ground-truth speaker labels for this meeting, so a hidden second speaker, a single speaker with varied delivery, or noisy short spans cannot be ruled out. Measured: similarities and span counts above. Not known: who spoke when, and whether the accented speaker is in the big cluster at all.
5. Tried an English-trained embedding (wespeaker voxceleb resnet34, already in dev assets) on the same spans: more similar, not less (pairwise median 0.79, centroids 0.89). It is worse here.

## Fixes tried offline on this meeting (speaker stage only)

| Fix | Speakers | Split |
| --- | --- | --- |
| Shipped (floor 10 s, guard 0.4) | 1 | none |
| Floor 5 s or 3 s, guard 0.4 | 1 | none |
| Floor 5 s or 3 s, guard 0.5 | 2 (86 s / 5 s) | only the 5 s sliver; AMI sweep shows guard 0.5 adds false speakers |
| Merge line 0.55 or 0.45 | 1 | none |
| Sherpa threshold 0.5 to 1.1 | 1 (relabel) | none |
| English embedding model | 1 | none (more similar) |
| Known speaker count = 2 (`knownSpeakers`, no UI) | 2 (86 s / 5 s) | forces it; the 5 s is probably not the accented speaker |

## AMI regression

No default was changed, so no regression run was needed. The existing sweep (`docs/research/ami-short-speaker-sweep-20261114.md`) already shows what lowering floors or loosening the guard costs on AMI: floor 5 s with guard 0.5 gave 2 false extra speakers on the tuning meetings and 2 on the held-out ones, floor 3 s with 0.5 gave 2 and 3.

## Recommendation

- **Do not change any default** (floor, guard, merge line, sherpa threshold): none of them separates this meeting, and the loosened ones add false speakers on AMI.
- The leading hypothesis (unverified) is weak segmentation plus embedding on this voice, which resembles the earlier TS3003a case; the known-hard fix is overlap/turn-aware re-clustering (`docs/research/overlap-aware-diarization-note.md`), large, owner approval.
- Smallest useful step, **needs owner approval** (contract change): a "number of remote speakers" choice wired to `knownSpeakers`, with a re-run of the final pass. It forces two clusters but the second would be the 5 s sliver here, so it is only helpful together with better segments; confirm by listening before building.
- Owner's stated need: a model that reliably separates speakers (recognising the accent itself is fine). Next step: a fixed speaker-separation benchmark across candidate embedding/diarization models on AMI plus a ground-truth snippet. This is a Regiurn job and **needs owner approval**.
- Cheaper next check, no approval: the owner (or an owner-permitted run) listens to this meeting's first minutes and notes where the accented speaker talks, so a ground-truth turn list can score a candidate embedding model (a multilingual or accent-robust one) on the same spans.

No backend PR: no fix is both small and safe.
