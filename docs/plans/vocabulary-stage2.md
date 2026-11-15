# Plan: vocabulary Stage 2 (thousands of learned terms)

**Status:** draft for owner approval, independent review pending. Docs only: no code, no recordings, no decode run. Date 2026-11-15, base `main` `66143b10`.
**Owner request (2026-11-15):** resume Stage 2 because about 40 hint terms feels too low next to a word processor's dictionary.
**Builds on:** [vocabulary-rules.md](vocabulary-rules.md), [vocabulary-gate5-evaluation.md](vocabulary-gate5-evaluation.md), [vocabulary-hint-context-fix.md](vocabulary-hint-context-fix.md), [vocabulary-hint-mc128-code-pr.md](vocabulary-hint-mc128-code-pr.md), `docs/gates/vocab-gate5-stage1-results-20261112.md`, `docs/gates/vocab-mc-test-results-20261112.md`, `docs/gates/gate-5-persistence-evidence-20261114.md`.

## 0. Plain summary

The speech model's prompt can only take about 40 terms, so a bigger list cannot be sent as a hint. The way to use thousands of terms is a second step **after** transcription: look for the wrong spellings the user has already fixed before, and fix them again only when strict rules say it is safe. The hint stays, but picks the 40 most relevant terms per meeting. Everything is shown in an audit list and can be undone.

## 1. Why the hint measured inert, and the smallest test to settle it

**What is known (from the results notes):**

- Stage 1: hint-on output was word-for-word identical to hint-off (recall 8/30 both, WER 23.91% both). The code passed `-mc 0`, which makes whisper.cpp `284029c` drop the prompt, so the "hint" never reached the model.
- `-mc 128` (now in `whisper.ts`, `HINTED_MAX_CONTEXT`) on one meeting (TS3003a) and one 10-term set: recall 8 to 16 of 30, WER 23.91% to 23.05%. Negatives: 1 benign event at `-mc 128`; ES2003c WER 1.9 points worse; one real wrong held-out word ("waterproof"), probably from the non-zero context, not the hint (unverified). Verdict: inconclusive.
- Not known: whether the gain holds on other meetings, other term sets, or at 40 terms (the test used 10); whether benefit survives when the terms are _not_ in the meeting (a wrong hint is the false-replacement risk).

**Smallest test (H1), settles "can hints help at all":** reuse the retained `eval-vocab/` files and scorer; add no new audio.

1. Two new invented/fixed term sets on **two AMI meetings that are not TS3003a**, chosen from meetings already local or already used as negatives (candidates: ES2004a, IS1009a, ES2003c): per meeting, 10 terms with at least 2 reference occurrences that hint-off at `-mc 128` got wrong, written to `terms.json` before any hint-on run.
2. Per meeting, three decodes at `-mc 128`: hint off, hint on (10 terms), hint on (40 terms: the 10 plus 30 distractors from other meetings' references that do not occur in this one). Distractors test the realistic case and the false-replacement risk.
3. Score with the existing scorer (recall, WER, false events).

**Pre-registered bars (H1):** _Hints can help_ = in both meetings, recall on > off and WER on <= off + 0.3 points (absolute) at 10 terms, and 40-term recall at least the 10-term recall minus 1 occurrence, with 0 false events from distractors. _Cannot help_ = recall gain in neither meeting. Anything else is INCONCLUSIVE; the owner decides, and the plan proceeds on the correction pass anyway (section 2A does not depend on the hint). Expected cost: 6 decodes of about 17 to 25 min audio each, about 5 to 10 min total decode at ~63x real time plus setup and scoring: **estimated 30 to 45 min, over 20 min, needs owner approval**. Run each decode once; no automatic reruns.

## 2. Approach that scales

### 2A. Correction pass after transcription (primary)

What it applies: the user's learned fixes, "misheard text to correct text", already stored per term (`vocabulary_misheard`, `vocabulary_contexts` pointing to correction records in `transcript.json`). It runs after the final pass and after import, never on live text (V1) and never on a frozen span.

**Matching rules (all must hold, otherwise leave text unchanged):**

1. **Whole-word or whole-phrase match**, case-insensitive, NFC-normalized, on the word sequence; never inside a larger word; punctuation ignored at the edges only. Phrase (multi-word) misheard forms need all words adjacent with no long pause (gap under 500 ms, tunable by the test).
2. **Common-word guard:** a misheard form that is an ordinary word (top-N frequency list bundled with the app, N tuned on AMI so that the guard blocks "pen", "kick off" and similar) is never replaced on its own. It may be replaced only with a context match (rule 3) _and_ score at least the high threshold.
3. **Context rule:** each learned correction keeps the words around it (up to 3 before and after, stored beside the correction). A candidate scores by (a) the share of those neighbours seen again, (b) the same speaker or a speaker in the same previous meetings, (c) the word's recognizer confidence if the model output has it. Bare matches with no context evidence stay unchanged.
4. **Per-term confidence** from history: number of active remembered corrections, number of distinct meetings, and a **conflict count** (times the same misheard form was _left_ uncorrected, found where the user reviewed the meeting and the form stayed; also times a correction was reverted). Replacement threshold rises with conflicts; a term with a revert is never auto-applied until the user re-enables it. The initial formula and thresholds are fixed in the slice 3 plan before any test (pre-registration), then not tuned on the test set.
5. **One form, one target:** if a misheard form maps to two different correct terms, skip it and list it for the user.
6. **Frozen spans:** the pass skips any word inside an `active` or `superseded` correction (existing layer rule, `corrections.ts`) and the pass's own replacements are saved as corrections of a new kind, so the final-pass re-run keeps them frozen exactly as it keeps user edits. Re-running the pass is idempotent.

**Safety UI/backend behaviour:**

- Every replacement is an ordinary reversible correction record with original words, timing and audio link, plus `source: 'vocabulary'`, the term id and the score and rule that fired. Original words are never lost.
- **Undo:** one click per replacement, **and** "undo all vocabulary fixes in this meeting"; undo of a pass fix tells the term (counts as a conflict). Edit, disable and delete of a term (already designed) stop it applying in new meetings only; they do not rewrite saved transcripts unless the user chooses "undo all".
- **Audit list:** a meeting-level list "Fixed by your vocabulary" with before, after, time, term and reason; click jumps to the audio. Also shows "skipped, unsure" items so the user sees what was _not_ changed.
- **Off switch:** a setting (default **off** until the Gate 5 evidence passes, then on, owner decision) and a per-term toggle.
- The user's own corrections and speaker edits always win; the pass runs only inside the pass's lock window as part of the final pass, so corrections made during it are kept (existing `applyFinalPass` locking).

### 2B. Smarter selection of the 40 hint terms (secondary)

Replace "newest 40 enabled terms" by a deterministic per-meeting ranking, same output cap (40 terms, 512 characters) and stable for one job: score = presence in the meeting title, typed notes and outline (when those exist), overlap with the previous meetings with the same speakers (voice-profile or speaker-name match), then frequency and recency. Pure function of local data; tie-break by term text. Slice 5 only; ships only if H1 says hints can help.

## 3. Storage and performance limits

- Targets: **10,000 terms**, 3 misheard forms and 5 contexts each, so about 80,000 rows. Current SQLite tables (`vocabulary_terms`, `_misheard`, `_contexts`, `_misheard_sources`) can hold this; `enabledTerms()` currently has a 200-row limit that a new, separate lookup must not inherit.
- Matching must not scan terms per word. Build an in-memory **index once per pass**: misheard form (normalized) to candidate terms, plus a phrase-start map by first word. Cost is proportional to transcript length times a small factor, not terms times words.
- Budgets to verify (tests, section 4): index build under 1 s and under 50 MB for 10,000 terms; pass under 2 s for a 2-hour transcript (about 20,000 words) on the Mac; Vocabulary screen list stays responsive at 10,000 rows (UI needs paging or virtual list: slice 6). Misses are reported, not guessed.
- Context words stay in the meeting folder (existing rule); the pass reads only the contexts of candidates that matched a form. A candidate whose meeting file is unreadable has no context evidence, so it is not replaced.
- Suggestions (3 corrections in 2 meetings) already cap their scan at 50 meetings and 5,000 records; unchanged.

## 4. Gate, test design, pre-registered bars

**Gate 5 limit (from the Development Plan and `vocabulary-rules.md`):** learned terms improve recognition with **fewer than 1 false replacement per audio hour**; 100% of corrections survive restarts and final passes (met, 35/35). Stage 1's table is the standard here: with about 3.6 audio-hours, 0 events means the 95% upper bound is about 0.8 per hour (rule of three).

**Definitions.** _False replacement_ = **any** change by the pass where the new word differs from the AMI reference word at that place, whatever the pass-off output was. This includes right-to-wrong, **wrong-to-different-wrong** (pass-off was already wrong, the pass made it a different wrong word) and wrong-to-wrong at a place with no reference word (insertion). Each counts as one event and none is netted against good fixes. _Good fix_ = pass changed a wrong word to the reference word. _Missed_ = wrong word left unchanged. The scorer aligns pass-off, pass-on and reference words and reports the three event kinds separately, plus the total used for the gate.

**Data (AMI and invented only; never the owner's recordings).**

- **Invented history:** a generator writes thousands of learned corrections (misheard to correct) from AMI vocabulary _not_ from the test meetings, plus **adversarial traps**: misheard forms that are common words ("pen", "kick off", "there"), near-duplicates, phrases that are substrings of other phrases, forms mapped to two targets, forms that are correct elsewhere.
- **Calibration vs held-out (fixed now, before any scoring; changing it voids the run):** thresholds, the common-word list size N and the pause limit are tuned only on **calibration** meetings: ES2003c, ES2015c, EN2002d and ES2016c (already decoded at `-mc 128` in the mc test). **Held-out evaluation** meetings are never used to tune: TS3003a, ES2004a, IS1009a, ES2014b (4.06 audio-hours is the earlier set; ES2014b etc. as in the Stage 1 negative-controls list). Invented-history terms and traps are generated for calibration and held-out separately, with different seeds. Any meeting used to choose the H1 term sets (section 1) is calibration. Held-out results are computed once, after thresholds are frozen in the slice 3 PR description. If the Stage 1 list differs from these names, slice 3 lists the exact meeting IDs in each group before any scoring, with held-out at least 3.6 audio-hours.
- **Saved output:** all meetings decoded once at `-mc 128` and saved; the pass runs on **saved decode output**, so the pass tests need no new decodes and repeat in seconds.
- **Term set sizes:** 40, 1,000 and 10,000 terms, each seeded with the same real fixes for the held-out meetings (which the pass should find) hidden among the rest.

**Tests and pre-registered bars (fixed before the first run; thresholds not tuned afterward):**

| Test                                                                                                                                  | Bar                                                                                                              |
| ------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Unit and property tests: word boundaries, Unicode, overlapping phrases, frozen spans, idempotence, conflict skip, undo restores bytes | all pass                                                                                                         |
| Negative controls, 7 files (3.643 h), 10,000 terms with traps                                                                         | **PASS 0 false replacements; INCONCLUSIVE 1 to 3 (point rate under 1, upper bound over 1); FAIL 4 or more**      |
| Held-out TS3003a with real fixes                                                                                                      | good fixes >= 50% of the seeded true errors, false replacements 0, WER not worse than pass-off                   |
| Scale, 40 vs 1,000 vs 10,000 terms                                                                                                    | false replacements do not rise with term count beyond the 0/1-to-3/4 table; performance budgets in section 3 met |
| Persistence: restart, final-pass re-run, undo, redo with pass fixes                                                                   | 100% (extends `gate5-persistence.test.ts`)                                                                       |
| Hint selection (slice 5): ranked 40 vs newest 40                                                                                      | recall at least equal, 0 new false events, deterministic                                                         |

**INCONCLUSIVE** rule: results in the middle bands or recall gain within run-to-run noise are reported as INCONCLUSIVE; no automatic rerun; the owner decides on one further, separately approved run. Gate 5 vocabulary criterion is met only on the PASS rows together, and is stated as evidence on AMI plus invented data, not on the owner's meetings.

## 5. Run times and approvals

| Item                                                                  | Estimate (unverified)                                                                                 | Over 20 min?                                         |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Unit and property tests, performance budgets                          | under 2 min each run                                                                                  | no                                                   |
| Pass over saved decode output (negatives, held-out, three term sizes) | under 5 min                                                                                           | no                                                   |
| H1 hint test (6 decodes plus scoring)                                 | 30 to 45 min                                                                                          | **yes, owner approval before start**                 |
| New decodes for the correction pass                                   | none needed (reuse saved outputs); only if the saved outputs are lost, about 15 min decode plus setup | would need approval                                  |
| Any added AMI meetings beyond those local                             | download and 30+ min                                                                                  | **yes, approval, name files, source and size first** |
| Owner's own Mac trial of the app (informal, own meetings)             | not a gate; not measured                                                                              | n/a                                                  |

All raw outputs stay under `~/scrb-dev-assets/eval-vocab/`; nothing is deleted after a pass (evidence-retention policy).

## 6. Contract, UI and backend split

**Backend (packages/\*; no approval beyond review):** correction-pass module, index, scorer script, storage queries for 10,000 terms, hint ranking, applying pass fixes as corrections, settings flag.

**UI (`apps/desktop/src/ui/`):** Vocabulary screen paging or virtual list and search; per-term "auto-fix" toggle and confidence note; meeting "Fixed by your vocabulary" audit list with undo; setting switch; text change to the "about 40 terms" note (it then describes the hint only).

**`packages/contracts/` changes needed (list only; none made, each needs owner approval):**

1. `Correction`/transcript correction shape: a `source` marker (user vs vocabulary pass) and term id, score and rule fields, so the UI can show the audit and undo (new optional fields).
2. A call to list vocabulary-pass fixes for a meeting, and to undo all of them (new request names, allowlisted in preload and main per the security rules).
3. `listTerms` paging and search (request with `limit`, `offset`, `query`; today it returns all terms), plus a total-count field.
4. `VocabularyTerm` / `VocabularyTermPatch`: per-term `autoFix` boolean and read-only confidence fields.
5. A setting key for the pass on/off (if settings go through the contract).
6. A pass-progress or "applied N fixes" notice in the final-pass result, only if the UI needs it.

Where the contract lacks a field, the UI slice writes a handoff note in `docs/handoffs/`; the mocks must match the contract exactly.

## 7. Slices (one PR each; no slice starts code before this plan is approved)

1. **H1 hint test** (evidence only, no code except a scorer tweak): section 1. Owner approval for the run. Decides how much weight slice 5 gets.
2. **Index and storage limits:** term lookup beyond 200 rows, 10,000-term fixture, performance budgets, no behaviour change.
3. **Correction pass core:** matching, guards, scoring, frozen-span handling, idempotence, unit and property tests, invented trap generator, off by default and not wired. Pre-register thresholds in the PR description before the first test run.
4. **Wire the pass** into the final pass and import as reversible corrections, persistence extension of the Gate 5 tests, "undo all". Needs contract items 1 and 2 approved.
5. **Gate 5 evaluation run** on saved AMI decodes (section 4); results note in `docs/gates/`. Needs approval only if it exceeds 20 min.
6. **UI:** audit list, undo, toggle, Vocabulary paging and search, updated text. Needs contract items 3 to 5.
7. **Hint selection by meeting** (only if H1 says hints can help): ranking, tests, A/B on saved decode outputs.
8. **Turn on by default**, only after slice 5 passes and the owner approves.

Slices 2 and 3 are independent and can run in parallel; 4 follows 3; 6 follows the contract approval.

## 8. Risks and abandon conditions

- **False replacement of a real word** (the main risk): mitigated by section 2A rules, default off, audit list, undo. The pass touches only misheard forms the user fixed before.
- **Common-word corrections** ("pen" to "Penn" taught once) are exactly the failure case; the guard blocks bare matches and needs strong context. Cost: some true fixes are missed and shown in "skipped, unsure".
- **Over-fitting to the invented history:** real corrections differ; the bars are on AMI plus invented traps and are evidence of safety, not of benefit to the owner's meetings. A short owner trial (informal) is the first real-world signal.
- **Context stored in meetings that get deleted** leaves a term with less evidence; handled by treating missing context as "no evidence".
- **Hint context (`-mc 128`) side effects** (ES2003c worse, one wrong word) are separate from the pass and are not fixed here.
- **Contract changes need owner approval**; a delay blocks slices 4 and 6 only.
- **Scope creep:** no fine-tuning, no live-path substitution, no cloud service, no change to Electron settings.

**Abandon (recommend stopping) if:** the correction pass shows 4 or more false replacements in the negative controls after one fix round on the _rule set_ (not the thresholds), or fewer than 25% of seeded true fixes are found with 0 false replacements, or the owner's trial finds replacements the owner would not accept at a rate above 1 per hour. Then keep the 40-term hint, say so on the Vocabulary screen, and stop.

## Unverified

Decode speeds and the 63x figure on this task's hardware; whether Stage 1 outputs are still on disk (`eval-vocab/`); the common-word list source; whether whisper's per-word confidence is available in the final-pass output; AMI meetings other than those already local; the size of the owner's real vocabulary.

Not run: no code, `npm run check` on code, decode, hardware or recording. Invented and AMI data only.
