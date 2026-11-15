# H1 hint test — blocked before run (2026-11-15)

**Status: BLOCKED — no H1 verdict.** Owner approval to run H1 was given on 2026-11-15. This note records the prerequisite stop; no decode or scoring was performed.

## Prerequisite checks

- Pulled origin/main with fast-forward on 2026-11-15. Base: f258188f51324362d9c7176818ff1c54a90fe7fa.
- C: had 139.32 GB free at the initial check (above the 5 GB minimum).
- C:\Users\brand\scrb-dev-assets\eval-vocab was absent.
- Existing scorer is present at scripts/research/score_vocab_eval.py.
- In scripts/dev-assets.sh, neither the ami nor ami-series group has pinned entries for ES2003c or ES2015c. The script pins the shared downloads/ami/ami_public_manual_1.6.2.zip annotation archive, but that does not pin the missing meeting audio. No Windows-specific dev-assets script is present.
- Per the stop condition, no corpus files were downloaded and no unpinned fetch was attempted.

## Exact missing audio pins

The AMI mirror listing reports these file sizes:

| Required path in the assets tree | Mirror filename | Listed size | Pin status |
| --- | --- | ---: | --- |
| downloads/ami/ES2003c.Mix-Headset.wav | ES2003c.Mix-Headset.wav | 69M | No SHA-256 entry in scripts/dev-assets.sh |
| downloads/ami/ES2015c.Mix-Headset.wav | ES2015c.Mix-Headset.wav | 65M | No SHA-256 entry in scripts/dev-assets.sh |

Source: [AMI corpus mirror listing](https://groups.inf.ed.ac.uk/ami/AMICorpusMirror/amicorpus/HeadsetAudio/). The script's existing pinned annotation archive is [ami_public_manual_1.6.2.zip](https://groups.inf.ed.ac.uk/ami/AMICorpusAnnotations/ami_public_manual_1.6.2.zip).

## H1 outcome

No terms.json was written because hint-on decodes did not start. There are no raw H1 outputs or scores. The pre-registered bars were not evaluated, so the result is **not classifiable as HINTS CAN HELP, CANNOT HELP, or INCONCLUSIVE**. H1 can proceed only after these two audio files have pinned SHA-256 entries and the assets are made available.

No private recordings were accessed.
