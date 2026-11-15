# long-run-report test failures on BCHEN-W10: diagnosis (2026-11-15)

**Status:** cause not confirmed. No clear portability bug in the test or script, so no code change. The confirm commands below settle it. Windows Gate 8 depends on `overnight.mjs --report`, so run them before the overnight test.

## What is known

- `scripts/long-run-report.test.mjs` (7 tests) runs `node --experimental-transform-types scripts/long-run/overnight.mjs --report <dir>` and reads the last stdout line. If node exits early, stdout is empty and every test fails with `expected '' to be 'RESULT: ...'`.
- The same symptom was seen on Regiurn on Node 26.13.0 (4 failures, `docs/handoffs/regiurn-null-origin-packaged-check-20261114.md`). On Node 22.23.4 it passed 4 of 4 there. This Mac runs 22.23.4. CI passes.
- The script sets no path separators or line endings that differ between platforms: the test builds paths with `join`, writes logs with `\n`, and `pathToUrl` handles backslashes. `--report` needs no ffprobe or ffmpeg.
- Both `.mjs` files import only `node:` modules. The report mode loads `packages/app-core/src/recovery.ts` only when `sealed.json` is missing, and the test writes it, so that path is not used.

## Hypotheses, most likely first

1. **Node version on W10.** The flag `--experimental-transform-types` needs Node 22.7 or newer and may behave differently on very new Node (26.x showed the same symptom). A `node` that is too old or too new exits at once with a bad-option or startup error and prints nothing to stdout. `engines` says `>=22.12.0`. Fix if confirmed: install Node 22.23.4 and put it first on PATH.
2. **A second, different `node` on PATH** (for example an installer copy ahead of the project one), so the test child process is not the node the owner thinks. Same fix.
3. **The child process fails for another reason that the empty stdout hides** (antivirus holding temp files, `%TEMP%` path problem, locale). Only the stderr text can show it.
4. Real script regression on Windows. Unlikely: CI runs windows-latest and passes.

## Commands to confirm

PASTE INTO: a Codex or Claude Code session, or Windows PowerShell (not admin), on PC BCHEN-W10, folder = the scrb repo clone on W10. Admin: no. Do not run the long-run scripts themselves.

1. `node -v`
2. `(Get-Command node -All).Source`
3. `git status --short; git log -1 --oneline` (expect clean, on current `main`)
4. `npx vitest run scripts/long-run-report.test.mjs 2>&1 | Tee-Object -FilePath $env:TEMP\lrr.txt`
5. `Select-String -Path $env:TEMP\lrr.txt -Pattern 'FAIL|expected|Error' | Select-Object -First 40` and paste the output, with the name and message of each of the 7 failing tests.
6. Show what node itself prints (the part vitest hides): `node --experimental-transform-types scripts/long-run/overnight.mjs --report $env:TEMP\no-such-dir; echo "exit=$LASTEXITCODE"`. A bad-option or "not found" message of the script's own means node starts fine. Note the exact stderr text.
7. `(Get-Command ffprobe -ErrorAction SilentlyContinue).Source; (Get-Command ffmpeg -ErrorAction SilentlyContinue).Source` (informational; `--report` does not use them).

## Reading the results

- Step 6 prints `bad option` or a flag error: hypothesis 1. Install Node 22.23.4 and rerun step 4.
- Step 6 prints a script usage or evidence-folder message: node and flag are fine; hypothesis 3. Send steps 4 to 5 output to review.
