### A-869 — 2026-11-19 — Mac A2 read-only model check used the wrong segmentation path

- **Status / attribution:** Confirmed verification-helper error; no model, application or user data was changed.
- **What failed:** The first read-only inventory mapped `segmentation-model.int8.onnx` to the model root, although the handover stores it at `models/sherpa-onnx/sherpa-onnx-pyannote-segmentation-3-0/model.int8.onnx` and also carries a pinned archive. The helper therefore printed a false missing result and treated the separate Qwen summary model as part of the five-file speech handover.
- **Impact:** A temporary false BLOCKED indication during preflight; no files were written by that check.
- **Correction / remaining risk:** The five speech files were checked at their documented paths and against `model-digests.json`; the extracted segmentation file and source archive matched their pinned size/hash. The summary model was excluded per the handover documentation. Low.
