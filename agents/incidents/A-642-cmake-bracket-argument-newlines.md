### A-642 — 2026-11-16 — Codex / BCHEN-W10 — generated CMake bracket arguments split across lines

- **Effect:** A second CMake configure for the sherpa sidecar failed before compilation; no executable was produced and tracked source remained unchanged.
- **Evidence:** The temporary `CMakeLists.txt` placed each bracket-quoted path on its own line, and CMake reported no source plus a whitespace-wrapped import-library item.
- **Cause:** My PowerShell-generated CMake text was split around bracket arguments instead of preserving each path as one CMake argument.
- **Correction:** Use simple CMake variable references and pass the three absolute paths as separate `-D` arguments; inspect the generated file before configuring.
- **Remaining risk:** Confirm the output file and DLL closure before using this sidecar.
