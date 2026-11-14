### A-355 — 2026-11-13 — Windows PC — prerequisite check used the wrong workdir

- **Status / attribution:** Confirmed agent command error; no files changed.
- **What failed:** I ran a check for `C:\Users\brand\scrb-dev-assets` from `C:\Users\brand\Documents\ChatGPT\srcb` without the required scoped access, and PowerShell returned `Access to the path 'C:\Users\brand\scrb-dev-assets\upstream\whisper.cpp\CMakeLists.txt' is denied.`
- **Impact:** That check was inconclusive and briefly delayed the Step 4 prerequisite check.
- **Correction / remaining risk:** Re-ran from the requested clone with scoped access; the whisper source, CMake and Ninja were present. Low.
