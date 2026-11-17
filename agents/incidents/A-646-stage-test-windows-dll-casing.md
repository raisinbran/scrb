### A-646 — 2026-11-16 — Codex / BCHEN-W10 — staging test compared DLL names case-sensitively

- **Effect:** The first focused staging test run reported one failure even though the dependency was staged as `MSVCP140.dll`; the other four tests passed.
- **Evidence:** The assertion expected the lowercase string `msvcp140.dll`, while the Windows import table preserved uppercase spelling.
- **Cause:** I wrote a case-sensitive test assertion for Windows DLL names, which are resolved case-insensitively.
- **Correction:** Compare staged filenames in lowercase in this assertion.
- **Remaining risk:** The real staged dependency walk and all six tool smoke probes still need to pass.
