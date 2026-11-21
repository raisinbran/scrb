### A-925 — 2026-11-20 — W10 — First local Sherpa sidecar launch lacked its runtime DLL closure

- **Status / attribution:** Confirmed setup error; no product defect established.
- **What failed:** The locally compiled pinned sidecar exited with Windows status `3221225781` before inference because its Sherpa/ONNX and VC runtime DLLs were not beside the executable.
- **Impact:** That initial launch produced no diarization result.
- **Correction / remaining risk:** Staged the already verified pinned DLL closure in the ignored local runtime folder; later diagnostics completed successfully. No DLL was added to Git. Low.
