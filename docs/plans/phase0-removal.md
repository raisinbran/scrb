# Remove `phase0/` from the product repository

**Plan only. Needs independent review, then owner approval, before any step starts.** Written 2026-11-12 against `main` at `ffec37d`.

## Why

The Development Plan put Phase 0 in a separate scratch repository. It was mirrored into this one on 2026-10-28 instead, and product code now depends on it: build scripts, test scripts, one unit test, and the owner's local live and final-pass configs. The folder is 24 GB on disk (16 GB of models, 1 GB of upstream builds, 945 MB of AMI audio, 5.8 GB of artifacts), of which 604 files are tracked. New work keeps adding paths into it.

## Rules this plan keeps

- **Nothing is deleted.** Phase 0 results are Gate 0 evidence. Tracked files stay reachable through a tag, and untracked files are moved and checked by hash, never removed. Deleting the old copy needs the owner's separate approval, under `docs/gates/evidence-retention-policy.md`.
- Models, builds and audio stay out of git.
- It works on the Mac and on both Windows PCs.
- It doesn't depend on the scrb v2 decision. The v2 PRs (#87–95) also want `phase0/` gone, and these steps help either backend.

## What depends on `phase0/` today

| Use | Where | Needs from `phase0/` |
| --- | --- | --- |
| Native builds | `native/macos-capture/build.sh`, `tests/run.sh`; `native/windows-capture/scripts/fetch-opus.ps1` | `upstream/opus`, `tools/venv` (CMake), the commit pins in `MANIFEST.md` |
| Native test scripts | `native/windows-capture/scripts/*_case.mjs`, `long_run.mjs`; `native/macos-capture/scripts/*.py`, `tests/continuous-worker.mjs` | `probes/windows-mute`, `probes/windows-tone-player` builds, `scripts/run-muted.sh`, whisper models and binaries |
| Unit test | `packages/summary/test/recorded.test.ts` | `fixtures/summary/ES2016b.transcript.txt` |
| Evaluation scripts | `packages/transcription/scripts/e2e-ami.ts`, `m1-joins.ts`; `packages/summary/eval/run.ts`; `apps/desktop/scripts/live-diarization-replay.ts` | models, `upstream/whisper.cpp` builds, `downloads/ami`, `scripts/score_*.py`, `prepare_ami_summary.py` |
| Dev app runs | the owner's `SCRB_LIVE_CONFIG` and `SCRB_FINAL_PASS_CONFIG` files (untracked) | model and tool paths |
| Repo config | `.gitattributes`, `.gitignore`, `.prettierignore`, `eslint.config.mjs` | ignore rules only |
| Docs | Gate 2 records, `native/windows-capture/README.md`, `HANDOFF.md`, `results/*.txt`, 15 files under `docs/` and `agents/` | text references and evidence paths |

## Steps

Each step is one small PR, with CI on both platforms.

1. **Dev assets outside the repo.** Add a `SCRB_DEV_ASSETS` folder (default `~/scrb-dev-assets`, `%USERPROFILE%\scrb-dev-assets` on Windows) holding `models/`, `upstream/`, `tools/` and `ami/`. Add `scripts/fetch-dev-assets.mjs`, which takes the URLs and versions pinned in `phase0/MANIFEST.md` and checks each file's SHA-256. The manifest hashes only three Windows downloads, so first record the hashes of the owner's current copies as the reference for the rest. The script copies from an existing `phase0/` when one is present, so nothing is downloaded twice. Point every script and native build above at `SCRB_DEV_ASSETS`, and update the owner's two dev config files to match.
2. **Move the small tracked parts that are still used** into product folders, with `git mv` so their history follows:
   - `fixtures/summary/` → `packages/summary/test/fixtures/`
   - `probes/windows-mute`, `probes/windows-tone-player` → `native/windows-capture/tools/`
   - `scripts/run-muted.sh` → `native/macos-capture/scripts/`
   - `scripts/score_ami_wer.py`, `score_der.py`, `prepare_ami_summary.py` → `scripts/eval/`
   - `MANIFEST.md` pins and `THIRD_PARTY_NOTICES.md` → `third_party/`
3. **Archive the rest.** Tag the last `main` commit that still has `phase0/` as `phase0-archive`. Point doc and evidence links into `phase0/` at that tag (a `blob/phase0-archive/phase0/...` URL), then remove `phase0/` from `main`, along with its ignore rules and config entries.
4. **Untracked data.** Once step 1 has copied the assets and checked their hashes, the owner decides whether to delete `phase0/` on each machine or keep it there. The 5.8 GB of local artifacts stay put until they decide.

## Done when

- `git grep phase0` on `main` finds only links to the `phase0-archive` tag and this plan.
- `npm run check` and CI pass on macOS and Windows.
- `native/macos-capture/tests/run.sh` passes on the Mac, and the Windows capture build plus one short `_case.mjs` run passes on one Windows PC. This is a short test, well under 20 minutes.
- One dev launch on the Mac with the updated live config records a short clip with live text.
- No file under the old `phase0/` paths has been lost: tracked files are reachable at the tag, and untracked files are copied with matching hashes.

## Risks

- **Windows path differences** in the probe builds and scripts: mitigated by one short Windows run before step 3.
- **Old evidence paths on the Windows PCs** (`results/*-hashes-*.txt` name absolute paths): left as they are, since they record where a file was when it was hashed.
- **Open draft PRs that add new `phase0/` paths:** rebase or retarget them before step 3.

## Effort

About four short PRs, plus one owner session on each machine for the asset move and checks.
