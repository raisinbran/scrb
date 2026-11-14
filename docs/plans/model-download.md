# First-launch model download

**Status:** plan plus main-process download manager, 2026-11-13. Independent review: pending. Contract changes below are **proposals, not implemented**.

## Files, sources, storage

The five models in `scripts/model-digests.json` (SHA-256 and byte size pinned; about 806 MB). URLs are the ones `scripts/dev-assets.sh` already pins, copied into `MODEL_URLS` in `model-download.ts` (a test fails if a digest has no URL):

| File                                                     | Source                                                                                                                      |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `ggml-large-v3-turbo-q5_0.bin`, `ggml-small.en-q5_1.bin` | huggingface.co `ggerganov/whisper.cpp`, `resolve/main` (a branch, not a commit: the digest is the pin)                      |
| `ggml-silero-v6.2.0.bin`                                 | huggingface.co `ggml-org/whisper-vad`, pinned commit                                                                        |
| `3dspeaker_…16k.onnx`                                    | github.com k2-fsa/sherpa-onnx release `speaker-recongition-models`                                                          |
| `segmentation-model.int8.onnx`                           | the release's `sherpa-onnx-pyannote-segmentation-3-0.tar.bz2` (archive digest in `dev-assets.sh`; member `model.int8.onnx`) |

**Missing:** no mirror we control (all five depend on third-party hosts staying up); the archive's byte size is not in `model-digests.json` (only its SHA-256, so disk estimate uses the model size); the exact CDN hostnames Hugging Face and GitHub redirect to were not observed (no real download was run), so the allowlist is by parent domain (`huggingface.co`, `hf.co`, `github.com`, `githubusercontent.com`) and must be confirmed on one real run by the owner. Tools (ffmpeg, whisper-cli…) are bundled, not downloaded.

Storage is the existing `modelsDirFor`: macOS `~/Library/Application Support/Scribe/models`, Windows `%LOCALAPPDATA%\Scribe\models`.

## Behavior

- **Where:** main process only (`model-download.ts`); the renderer never touches the network. Uses Node `fetch` with manual redirects.
- **Security:** https only; at most 5 redirects, each hop re-checked (https, host on the allowlist), so no redirect to another host or to http; no cookies or auth sent; nothing downloaded is executed. The one tool run on a download is the system `tar`, on a hash-verified archive, extracting one named member into a temp folder, then the member is hash-checked again.
- **Verify:** stream to `<name>.part`; size check, then SHA-256 against the pin; only then atomic rename. Mismatch deletes the part and fails as "integrity check" (no automatic retry of a bad file).
- **Resume and retry:** `Range: bytes=N-` from an existing `.part` (also after an app restart); a 200 answer restarts the file. Dropped connections, truncated bodies and 5xx retry up to 3 times with a delay; 4xx and integrity failures do not.
- **Disk:** before starting, free space must cover the remaining bytes plus a 256 MB margin, else a clear failure and nothing is downloaded.
- **Cancel:** aborts, keeps `.part` for resume, emits no failure.
- **Offline afterwards:** after install nothing contacts the network; startup verification (cached by size and mtime) is unchanged. No download is attempted unless the user starts one.
- **Corrupt later:** a model that fails startup verification is reported missing by the existing setup status; starting the download again replaces it.
- **Packaged setup:** the packaged resolver already lists missing models. After a download the config files are rewritten only on the next launch, so the last `done` event says to reopen Scribe (no live reload in this PR).

## Existing contract reused (no change)

- `startModelDownload` (void → void): starts or no-ops if running. Wired only in packaged builds with a missing model; elsewhere unchanged.
- Event `modelDownloadProgress` `{role, modelName, state: downloading|verifying|done|failed, bytesDone, bytesTotal, message?}`: one file at a time, per file; failures carry an allowlisted message.
- `getSetupStatus`: models turn `installed` as files verify.
- Retry = call `startModelDownload` again (resumes).

## Contract changes (owner approved 2026-11-13, implemented)

1. `cancelModelDownload` (void → void, idempotent), wired in packaged builds and in the mock (no-op).
2. `ModelDownloadProgress` gains optional `overallBytesDone`, `overallBytesTotal` and, on `failed`, `reason` (`offline|checksum|size|diskSpace|insecure|http`).
3. Not needed now: `checkModelUpdates`, `installModelUpdate`, `revertModel` (update and revert confirmations) are separate work that reuses this manager.

## Tests

Local `http` test server and a 100 KB fixture (no real model is ever fetched): match, mismatch, oversize, truncated (resume), leftover part, server ignores Range, offline, cancel, disk space, skip installed, http and cross-host redirects, 404 no retry, archive extract with digest check.
