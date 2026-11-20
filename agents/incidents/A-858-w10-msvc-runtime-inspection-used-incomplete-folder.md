### A-858 — 2026-11-19 — W10 — first MSVC runtime hash check omitted OpenMP directory

- **Status / attribution:** Confirmed diagnostic-path error; no toolchain or repository files changed.
- **What failed:** The first runtime hash check assumed all five pinned MSVC DLLs were in the `Microsoft.VC143.CRT` folder. That folder does not contain `VCOMP140.DLL`, which is supplied from the version-matched `Microsoft.VC143.OpenMP` folder.
- **Impact:** The first check reported one missing source path; it did not establish a runtime DLL hash mismatch or package failure.
- **Correction / remaining risk:** Located the version-matched OpenMP redist folder under the same pinned `14.44.35112` redist and rechecked the DLL against the staged hash. Low.
