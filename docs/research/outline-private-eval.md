# Outline fill: private-meeting evaluation (local only)

The loader and runner score the outline-fill engine (`packages/outline`) on the owner's own meetings. No agent reads that folder: the runner prints numbers only. Tested on invented fixtures in `packages/outline/test/fixtures/private-sample/`.

## Run it (Mac, Terminal, no admin)

```bash
cd ~/Documents/GitHub/scrb && export PATH=$HOME/.local/share/scrb-node/current/bin:$PATH && npm run eval:private -w @scrb/outline
```

Optional arguments after `--`: meetings folder, then output file. Defaults: folder `~/Documents/scrb-private-samples/outline-fill/`, results written to `_results.txt` inside it. The runner refuses an output path inside the repository. Folders starting with `_` or `.` are ignored; a recording in a meeting folder is never opened.

## Folder format

The runner reads the owner's original formats directly, so no manual conversion is needed. Per meeting folder, by fixed priority (the first name in sorted order wins; the output reports only how many other candidates were ignored): outline `outline.md`, then `.eml`, then `.pdf`; notes `final-notes.md`, then `.docx`; transcript `transcript.txt`, then another `.txt`, then a `.md` that is not the outline or notes. Recordings are never opened.

- `.eml`: the plain-text body, else the HTML body stripped of tags. Headers and addresses are never kept.
- `.pdf`: text through a pinned dev-only parser (`unpdf`).
- `.docx`: read as zip and XML with no library. One line per paragraph in document order; table cells are walked in order so a row's topic cell and notes cell are separate lines; list items (bulleted or numbered) stay plain lines because agenda topics are often Word list paragraphs.
- Text from `.eml` or `.pdf` is trimmed to agenda items: everything from the first sign-off line on is dropped, as are greetings, links and addresses, meeting logistics (join, dial-in, passcode, "When:"), time and date lines, lines under 2 words, and prose over 20 words; in a structured agenda (3 or more marked or indented lines) an unmarked line ending in a period or colon is an intro or closing sentence and is dropped. The per-meeting line reports "agenda lines kept X of Y". `outline.md` is used as written.

The sections below describe the plain-text layout.

One sub-folder per meeting: `outline.md`, `transcript.txt`, `final-notes.md`.

- `transcript.txt`: plain text. Optional per-line `[mm:ss]` or `[hh:mm:ss]` prefix and optional `Name:` speaker prefix. Without times, each line is a separate turn (2.5 s apart, 0.4 s per word). Times affect block cutting and the time-weighted score.
- `final-notes.md`: the notes under the outline headings. A heading line is any non-bullet line about as short as an outline item whose content words match that item's (all of them, or 75% overlap); markdown `#`, numbering and `**bold**` are stripped. Bullets and other lines are the section body. Any other heading-like line (markdown `#`, `2.`, `2)`, `2.1`, `A.`, all bold, all capitals, or a short line ending in a colon) ends the current section, so text under a heading the outline lacks is never filed above it. A plain unmarked heading cannot be told from a sentence and is not seen.

## Output safety and errors

The output path is refused (error `E_OUTPUT_UNSAFE`) when it is inside the repository (also through a symlinked parent), is a symlink itself (including a dangling one), is a directory, is the same file as anything inside a meeting folder (also by hard link), or is an existing file that does not start with the runner's header line. Only a previous results file is overwritten. Failures print one fixed line (`E_INPUT_MISSING`, `E_OUTPUT_UNSAFE`, `E_PARSE`, `E_UNKNOWN`) and exit 1; no path, folder name or exception text is printed.

## Output (numbers only)

Per meeting, numbered in folder-name order (names are never printed): words, blocks, outline items, items aligned to the notes, items not aligned, share of time that has a reference heading, mean alignment score. Then, for the package defaults and the AMI-tuned values, the same measures as the AMI report (`outline-slice1-accuracy.md`): time-weighted accuracy, accuracy where a heading exists, likely-correct, likely/unsure/not-placed shares, strict accuracy, median boundary error, meetings under 70%. Skipped meetings give a code only (`noOutline`, `noTranscript`, `noNotes`, `outlineRejected`, `emptyTranscript`, or fewer than 2 aligned items).

## How `final-notes.md` is aligned to the transcript

1. Each outline item gets the body of its matching notes section. An item with no matching heading, or a body under 3 content words, is **not aligned** and receives no reference dialog.
2. The transcript is cut into blocks with the engine's own cutter. Each block is compared with every aligned section body (content-word overlap weighted by rarity, words cut to 6 letters so typos and endings still meet). The heading text is not used, so the reference is not just the matcher's own signal.
3. A best-path search gives each block a section, with sections visited in outline order (skipping forward costs a little; going back is not allowed) and a block stays unlabelled when no section beats a minimum similarity. Unlabelled blocks between two blocks of the same section take that section.
4. The score treats a block with no reference heading as correct only if the engine leaves it Not placed.

## Limits

- The reference is an estimate, not an annotation. Notes written in different words than the speech (summaries, new vocabulary, names the ASR garbled in every mention) align poorly; "time with a reference heading" and "mean alignment score" show how much to trust a meeting. Low values mean the score is unreliable, not that the engine is bad.
- Monotone order: a real jump back to an earlier heading is labelled as the later item or left unlabelled, so jump-backs count against the engine.
- Small talk and off-outline dialog inside a section is labelled with that section; dialog before the first or after the last section stays unlabelled.
- Notes headings that differ from the outline (reworded, merged, split) leave items unaligned; headings repeated verbatim in bullets are ignored on purpose.
- Plain-text transcripts without times give synthetic timing, so boundary error is only a rough measure there.
- Results are numbers about one person's few meetings; they say nothing about other speakers or topics.
