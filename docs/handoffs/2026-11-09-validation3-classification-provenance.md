# Validation-3 UNIDENTIFIED classification: provenance (hashes only, 2026-11-09 PT)

No data in this note. Paths are relative to `C:\Users\bchen\Documents\ChatGPT\srcb\gate3-v3-preflight-20261108\` (outside Git).

Output: `observer-validation-3/classification-20261109/validation3-unidentified-classification.json`
SHA-256 `c1f648b578ef9bf56999cea104c1f3d1da9356acccb6b1abdf7d136bdbd40939`

Tool: `scripts/gate3-retest/classify-unidentified.py`, added in commit `6d7d242dad8768cf19d55a99e17b21c3ee6e27eb`, file SHA-256 `4d821bba46765b9a4f64be558196673bb3376ab12e727381a998b3a5729bacb4` (unchanged since).

Inputs (under `observer-validation-3/`):
| Input | Relative path | SHA-256 |
|---|---|---|
| raw observer | `raw.jsonl` | `26324897638767143942a949607ac6fb5fcccda33d41cec1302c831abcb83d96` |
| converted publications, microphone | `regenerated-corrected-parser-20261109/timestamped-microphone.json` | `8b0b91f70bf812331f5b1a047038a3c98d2189250368b65207634567b4a6f71a` |
| converted publications, meeting | `regenerated-corrected-parser-20261109/timestamped-meeting.json` | `fd5588060ad91bc90c59d3c133e98c295378f29152201b588f31e518b8eebf4b` |
| annotation, microphone | `draft-annotations-20261109/microphone-source-annotations-DRAFT.json` | `b3886c8ca21b652eebefe757db4a42a24af3b1da96fa56e0645862dbb983de18` |
| annotation, meeting | `draft-annotations-20261109/meeting-source-annotations-DRAFT.json` | `b5f7c2c69ed257ef99d3bf956bc6eb72346dd8349c982ec82fd1ee4019d83cee` |
| action log | `actions.log` | `ae7ab9e0c549f117f83d970c6cb130a9524d5e69bd9ca9ecb3cd5679811f1727` |

How the inputs were established: the output file records neither its inputs nor its command line. The inputs above were identified by file times and then verified by re-running the committed script on them (2026-11-09, scratchpad copy): the result equals the retained output exactly (parsed JSON equal). The later `draft-annotations-20261109-d6/` annotations were not used.

What the categories are: **heuristic.** Classes a to d come from time-text row location, accessibility-tree coverage and the matcher's own fields; they are not ground truth about why a word was not published. "In scroll-affected time" means the unit overlaps a scripted scroll window plus a 20 s recovery allowance. That overlap supports an explanation (the words scrolled out of the viewport) but **does not prove cause**: units overlapping a scroll window can also be recognition errors, and units outside one can fail for reasons the classes do not separate.
