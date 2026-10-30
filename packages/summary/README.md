# @scrb/summary

Post-meeting summaries from a finalized transcript, on a local llama-server
(Qwen3.5-9B Q4_K_M, Metal `-ngl 99`). Input and output are this package's own
narrow types (`src/types.ts`); they get mapped to the shared contract later.

```ts
const worker = new LlamaServerWorker({ serverPath, modelPath });
await worker.start();
const extraction = await extractItems(transcript, worker);
const summary = await writeSummary(extraction, worker, "brief"); // or "full"
await worker.stop();
renderMarkdown(summary);
isOutdated(summary, editedTranscript); // true: show OUTDATED_MESSAGE
```

## How it works

1. **First pass.** The transcript goes in sections of about 16k characters, with
   overlap. A JSON schema asks for actions, decisions, impacts and open questions.
2. **Coverage pass.** Windows of about 8k characters are read twice, once for
   follow-up work and once for settled points. Each read is one question, with a
   list capped at 6 and no earlier items shown; a shown list only got rephrased in
   Phase 0. This pass may not answer "unresolved", which it used to mark copied
   lines. It may not call a thing decided either: a coverage-only decision reads
   "Tentatively agreed" unless the first pass also found it.
3. **Loops.** A token-limit stop, bad JSON or a repeated item gets one sampled
   retry, then the section is halved (twice at most), then a warning names the
   time range lost. Nothing is lost silently.
4. **Checks.** Each item must cite a line in the section it was read from, with
   supporting words nearby. A wrong timestamp is repaired only from a quote found
   in the section, and flagged; otherwise the item is dropped. Unknown owners and
   dates read "Not specified"; ones not in the section read "Unconfirmed" and are
   flagged. Impacts default to "Inferred". Procedure is filtered out. Duplicates
   merge. Contradicting decisions are both flagged, not resolved.
5. **Prose.** Brief and Full are written only from the checked items. Full's
   critical decisions, impacts and open questions are rendered from the items, so
   they cannot drift. Numbers missing from the notes raise a warning. If the prose
   fails, the section notes stand in and the tables stay.

`transcriptHash` covers time, speaker and text of every line, so any correction
raises "May be outdated — regenerate?".

## Results

Judged item by item as in Phase 0; details in [eval/judgments.md](eval/judgments.md).

| Set | Items | First pass alone | With coverage pass |
| --- | ---: | ---: | ---: |
| Tuning (ES2016b, ES2008b, TS3012b) | 50 | 64% | **86%** |
| Held out (TS3005b, ES2015c, IS1004d) | 40 | not judged | **78%** |
| All six | 90 | | **82%** |

- Held out is the honest number: about 2 points under the 80% pass line and well
  under 90%. One judge, who also designed the prompts; Phase 0 saw 20-point swings.
- The coverage pass stays on. It added 11 of 50 items on the tuning set. Its cost
  is precision: about 16% non-items and 22% leftover repeats on held-out meetings
  (Phase 0 single pass: about 6% non-items), and tables of 13–36 actions and 32–50
  decisions a meeting.
- Time under load: 5–12 minutes to extract, about 1 minute for both narratives.
  Set `coverageChars: 0` to turn the pass off.

## Not done

- Protecting edited items on regenerate (needs the shared edit model).
- The second half of "combined and checked against the source" beyond the
  checks above: no pass compares items with each other for meaning, so a later
  reversal can sit beside the first version.
- Open questions are not closed when answered later in another section.

## Develop

```bash
npm install
npm run build
npm test
```

`npm test` needs no model. `test/recorded.test.ts` replays real answers from
`test/fixtures/ES2016b.recording.json`; prompt or schema changes need a new recording.

Evaluation holds the model lock per meeting and resumes from its saved answers:

```bash
eval/run-batch.sh ../../phase0/fixtures/summary eval/out/run ES2016b ES2008b TS3012b
```

Held-out fixtures come from `phase0/scripts/prepare_ami_summary.py` into
`eval/heldout/` (not committed). Always use the script: a replay whose prompts
changed starts the model, and that must happen under the lock.
