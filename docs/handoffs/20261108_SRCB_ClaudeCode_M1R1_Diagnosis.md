# SRCB: Task M1/R1 diagnosis — Windows CI storage-test timeouts (Claude Code, Opus 5.5 Medium, Mac)

**Base:** `origin/main` `e46d6e5`. **Mode:** diagnosis only. No code changed, no branch or PR, no CI reruns.

## Conclusion

**Most likely cause before the experiment (confidence: medium-high; see "Experiment result" for the revised conclusion):** the Windows runner's disk-sync latency varies a lot between runs. The storage tests make many disk-sync calls (`handle.sync()` on every atomic write, and SQLite with `synchronous = FULL` plus `journal_mode = DELETE`). In a slow run, the whole storage package runs about 1.5–3× slower, and whichever single test lands in the tail crosses Vitest's default 5 s limit. Which test fails changes from run to run. This is not a hang, a leaked handle or a code regression.

**`EBUSY` and `ENOTEMPTY` are consequences, not causes.** In every failing test, `Test timed out in 5000ms` comes first. Each test closes its library or database as the last line of its body (`await library.close()` / `db.close()`), not in a `finally`. When the test times out, that line never runs. The shared `afterEach` in `packages/storage/test/helpers.ts` then calls `rm(dir, { recursive: true })` on a folder whose `index.sqlite` is still open. Windows refuses to unlink an open file (`EBUSY`), while macOS allows it, which is why the error only appears on Windows. `ENOTEMPTY` on `…\logs` fits the timed-out test body still writing log files while `rm` runs, because Vitest does not cancel a timed-out body.

## Evidence

| Run | Code | Windows result | formats / index-db / library file time |
|---|---|---|---|
| [42448516572](https://github.com/raisinbran/scrb/actions/runs/42448516572) main `8646113` (PR #66, Markdown only) | same as `76436d3` | **2 timeouts** + `EBUSY` | **12.1 / 22.5 / 29.6 s** |
| [42423147249](https://github.com/raisinbran/scrb/actions/runs/42423147249) main `76436d3` | same code | pass | 7.8 / 21.9 / **43.2 s** |
| [42506620793](https://github.com/raisinbran/scrb/actions/runs/42506620793) main `e46d6e5` | | pass | 5.2 / 14.3 / 20.2 s |
| [42512044881](https://github.com/raisinbran/scrb/actions/runs/42512044881) PR #69 | | pass | 5.5 / 14.9 / 21.4 s |
| [42278482805](https://github.com/raisinbran/scrb/actions/runs/42278482805) PR #58, attempt 2 | | **4 timeouts** + `EBUSY` ×3, `ENOTEMPTY` ×1 | **16.1 / 27.0 / 37.2 s** |
| [42330732540](https://github.com/raisinbran/scrb/actions/runs/42330732540) phase8 port | | **2 timeouts** (library delete) + `EBUSY` | 7.4 / 25.6 / **67.6 s** |
| 8 other recent passing runs | | pass | 5.0–6.3 / 13.0–17.7 / 18.6–28.8 s |

- **Same code passes and fails.** PR #66 changed only Markdown on top of `76436d3`, which passed. The failure is environment-dependent, not caused by PR #66.
- **Tests sit close to the limit even when they pass.** "a transcript edit flags the summary…" takes 1.06 s in a normal run, failed at 5.05 s in run 42448516572, and *passed* at 4.66 s in PR #58 attempt 2. A test that normally takes 1 s has only about 4.5× headroom before the 5 s limit, and slow runs eat most of it.
- **The slowdown hits the whole package, not one test.** In failing runs, storage files with no failures (for example `index-db` in run 42448516572) also ran about 1.6× slower. Fast in-memory files (`corrections.test.ts`, 0.13–0.19 s) did not slow down, which points to disk sync rather than CPU.
- **Some timed-out tests are reported far past 5 s** (6.3 s, and 10.7 s in run 42330732540). The SQLite calls (`DatabaseSync`) are synchronous and block the timer while they run, which also points to slow I/O.
- **Failing tests in order** (each had a timeout first, then cleanup errors): run 42448516572: `formats › summary regeneration` (5.05 s), `library › cross-segment correction undo` (5.27 s). PR #58 attempt 2: `formats › rejects summaries…` (5.43 s), `index-db › upgrades a real index from version 4` (6.34 s), `library › crash at temp-synced` (5.16 s), `library › survive restarts and a final pass` (5.20 s; `ENOTEMPTY`).
- **What runs at the same time:** Vitest runs test files in parallel workers; the storage files finish last, overlapping each other and the slow `desktop` and `app-core` files. Concurrent disk-sync load is therefore plausible but unmeasured.
- **PR #58 attempt 1 is a different failure.** Two `profile-matching.test.ts` assertions (`expected false to be true`, in a test changed by PR #58) failed under a 109 s total run. That is not a storage timeout and should not be grouped with these.
- **Checked and ruled out:** missing `await` on close (`DatabaseSync.close()` is synchronous; `Library.close()` is awaited); shared temporary folders (each test gets its own `mkdtemp`); custom Vitest pool settings (defaults throughout, no `testTimeout` override in the storage project). Handles are closed correctly on passing paths: `EBUSY` never appears without a timeout before it.

## Confirming experiment (needs owner approval; about 4 Windows jobs of roughly 5 min each)

On a throwaway `rosmont/*` branch with a temporary workflow (not merged):
1. A disk-sync probe: 500 × (write 4 KB, then `handle.sync()`) in the runner's temp folder, printing p50, p95 and max.
2. Then `npx vitest run --project storage --reporter=verbose`, twice per job: once as is, once with `--no-file-parallelism`.

**Confirmed if** the jobs with a high probe tail are the ones where storage times grow, and serial file running shrinks the tail. **Rejected if** storage times stay high while sync latency stays low, which would point to CPU or worker contention instead.

## Experiment result (owner approved, 2026-11-08)

[Run 42513664418](https://github.com/raisinbran/scrb/actions/runs/42513664418), branch `rosmont/m1-windows-storage-probe-20261108` (one temporary workflow commit on `e46d6e5`, no PR, do not merge). Four `windows-latest` jobs, all green: 8 storage runs, 165 tests passed in each, no timeouts.

| Job | Sync probe p50 / p95 / max (ms), two probes | Slowest test, parallel → serial | formats / index-db / library file total, parallel → serial (s) | Wall time, parallel → serial (s) |
|---|---|---|---|---|
| 1 | 3.9/7.4/123 · 3.6/5.7/161 | 2.22 → 0.58 s | 7.3/17.6/27.7 → 1.6/5.8/15.1 | 28.1 → 24.6 |
| 2 | 3.8/5.2/83 · 4.0/6.0/33 | 1.91 → 0.69 s | 6.4/17.2/26.9 → 1.5/6.1/15.8 | 27.5 → 25.8 |
| 3 | 3.7/6.6/95 · 3.6/6.3/41 | 2.04 → 0.67 s | 6.4/16.5/25.6 → 1.8/6.1/14.6 | 26.1 → 24.9 |
| 4 | 2.5/3.9/129 · 2.5/4.2/33 | 1.72 → 0.64 s | 5.6/14.6/20.8 → 1.0/4.7/10.4 | 21.4 → 18.7 |

(Slowest test excludes `atomic.test.ts`, which has one ~1.1–1.5 s test in both modes.)

- **Disk-sync link: inconclusive.** Each probe ran *before* a test step, not during it, and showed normal sync times (p95 at most 7.4 ms; a rare 33–161 ms outlier in every probe). No run reproduced the failing-run slowdown.
- **Parallel-execution contention among the storage files: shown.** With only the 5 storage files running, parallel running made the slowest test 2.7–3.8× slower, and the formats file 3.6–5.6× slower, than serial running. Wall time was 1.2–3.6 s *longer* in parallel. The experiment measures the combined effect of CPU, memory, file-system, scheduling and disk competition; it does not show which resource is the bottleneck. Every job ran parallel first and serial second, so warm caches may account for part of the gap. The test steps used `continue-on-error`, so the job status alone proves nothing; the Vitest summaries show 165 passed / 3 skipped in all 8 runs.
- **Revised conclusion (independent QA by ChatGPT applied):** parallel storage-file execution slows these tests (high confidence), and running them serially is a reasonable mitigation (high). That this contention caused the historical 5 s failures is plausible but not proven; that disk is the specific bottleneck has low confidence; that serial running will end the intermittent failures is not established. The larger margin under serial running (a 0.6 s test instead of about 2 s) is an expected improvement, not a measured guarantee on slow runners.

## Mitigation PR

**[raisinbran/scrb#70](https://github.com/raisinbran/scrb/pull/70)** (draft, base `main`, branch `rosmont/storage-serial-tests-20261108`, commit `67b2305`): `fileParallelism: false` in `packages/storage/vitest.config.ts`, plus a one-line comment. Owner authorized it after ChatGPT's QA.
- On the Mac, the setting applies inside the root `projects` config: each storage file's tests run as one block instead of interleaving. `npm run check` passed.
- CI [run 42515498516](https://github.com/raisinbran/scrb/actions/runs/42515498516) passed on both platforms with no timeouts. Compared with `main` [run 42506620793](https://github.com/raisinbran/scrb/actions/runs/42506620793):
  - **Windows:** the whole suite took 58.65 → 61.72 s. Storage formats / index-db / library took 5.2 / 14.3 / 20.2 → 1.3 / 5.5 / 12.8 s. The slowest storage test (excluding the process-kill test) took 1.52 → 0.73 s.
  - **macOS:** the whole suite took 35.97 → 46.97 s, but the storage files were unchanged. The increase is in non-storage files (for example export parity 6.5 → 9.8 s), so it is runner variance.
- These are single runs. One green run does not prove the intermittent failure is gone. Still needed: independent review and an owner merge decision.

## Other fixes (not implemented)

2. **Test-only, cosmetic:** have `helpers.ts` close every opened library or database before `rm`. This removes the misleading `EBUSY`/`ENOTEMPTY` follow-on errors but **does not fix the timeout**.
3. **Not recommended:** weakening `fsync` or `synchronous = FULL` in storage runtime code. These protect the data and would be a risky change.

## Usage log (proposed row; tracker not edited)

| Date | Agent / device | Task | Outcome | 5-hour remaining (start → end) | Weekly remaining (start → end) |
|---|---|---|---|---|---|
| 2026-11-08 | Claude Code, Opus 5.5 Medium / Mac | M1/R1: Windows storage-test timeout diagnosis | Diagnosis, approved experiment, and mitigation draft PR #70 (CI green on both platforms); root cause not proven | 92% (11:04 PST) → 84% (11:37 PST) | 98% → 97% |

Readings come from the app's usage card. Same session as W1, run after W1 finished; no overlapping sessions and no reset. Times are this Mac's clock. GitHub Actions minutes are not included.

## Self-induced mistakes (for `agents/agent_self_induced_failures.md`)

1. Ran `gh` from the scratch folder (no repository), then wrote the repo flag as an unsplit zsh variable; two failed log downloads with no effect.
2. Used `echo ===` in zsh, which tries to expand `=cmd`; two commands exited non-zero after their useful output. No effect on findings.

## Noted, not investigated

Run [42511808590](https://github.com/raisinbran/scrb/actions/runs/42511808590) on `rosmont/agent-policy-propagation-20261108` (R2) failed on Windows; its log has no unit-test failure lines, and the failing step was not examined. The handoff described R2 as unpushed, so its CI run means someone has pushed it.
