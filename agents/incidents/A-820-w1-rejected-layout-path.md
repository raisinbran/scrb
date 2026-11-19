### A-820 — 2026-11-18 — W1 source inspection used a nonexistent CMake path

- **Status / attribution:** Confirmed agent inspection error; no source changed.
- **What failed:** I tried to read `native/windows-capture/CMakeLists.txt`, which is not present in this repository.
- **Impact:** That source-inspection command reported a missing file.
- **Correction / remaining risk:** Continued from the actual Windows `build.cmd` and staging sources. Low.
