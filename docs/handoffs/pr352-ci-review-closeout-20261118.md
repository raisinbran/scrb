# PR #352 — final CI, independent review and accounting handoff (2026-11-18)

## Verified implementation identity

- Implementation: [PR #352](https://github.com/raisinbran/scrb/pull/352), branch `rosmont/bounded-transcript-scroll-20261117`.
- **Verified HEAD:** `fef0688010fbcd44c452b53e851d99c6a345833e` — unchanged throughout this closeout.
- Both jobs on [CI #44260717830, attempt 2](https://github.com/raisinbran/scrb/actions/runs/44260717830) completed **PASS**: Windows and macOS format, typecheck, lint, unit tests, build, boundaries and Electron smoke. **No additional retry was launched.**
- The original implementation PR is still draft/unmerged. No owner merge authorization was given.

## Original failures — retain the evidence and uncertainty

1. **Attempt 1 on the same `fef06880` commit, Windows:** unchanged `apps/desktop/src/main/summary.test.ts:482`, “stops a running summary, and waits for its server, before scheduled retention deletes the meeting,” expected `run.results[0]?.ok === true` but obtained `false`. Neither the underlying deletion error nor any remaining paths appeared in that assertion. The test and summary implementation were not changed by PR #352; the same test passed on earlier `main` runs `44024067034` and `44269305094`, and on previous PR head run `44260487767`. Treat as an isolated, unexplained failure of an unchanged test — **not proven flaky and not proven to be a summary regression**. No summary or storage code was changed during triage.
2. **Attempt 1, macOS:** `e2e/transcript-jump-performance.spec.ts` missed the strict one-second first jump: 30-minute target **1,925.1ms** against a **<1,000ms** requirement; later targets were **902.6 / 916.8 / 948.8ms**. The first scroll occurred at **329.3ms**, versus about **39–47ms** on the next targets. Similar event/virtual mutation and ResizeObserver counts in the failed and passing traces supported a run-dependent scheduling delay, not a uniquely demonstrated easing formula or virtualization defect. **Specific cause remains unproven.**
3. **Unchanged-code control:** passing `fbb12930` and failing `fef06880` differ only in a usage-log Markdown row, not application or test sources. This justified **one** evidence-backed rerun of only failed jobs without a new implementation commit.
4. **Attempt 2 on the unchanged `fef06880` commit:** both jobs PASS. Sanitized synthetic eight-hour test observations:
   - macOS 30/59/242/470-minute target elapsed **869.4 / 878.8 / 885.4 / 868.6ms**; first scroll **229.8 / 43.2 / 44.9 / 46.6ms**; all four targets under one second.
   - Windows elapsed **869.9 / 868.4 / 874.8 / 872.0ms**; all four targets under one second.
   - A green rerun confirms the observed acceptance on that run but **does not prove the first-attempt delay cannot recur**. Do not relax duration limits, change easing, or blanket-classify the earlier failures as environment issues.

The [PR #352 triage comments](https://github.com/raisinbran/scrb/pull/352) preserve log locations and earlier failures, including incidents A-760 (Prettier), A-761 (redundant workflows), A-762 (manual Live scroll overridden), and A-763 (unrendered virtual active word). They remain in that PR's own change set and have no published main collision as of this handoff.

## Final code and regression review

- [Formal exact-head independent review #5962949053](https://github.com/raisinbran/scrb/pull/352#pullrequestreview-5962949053): **APPROVE verdict, no P0/P1 findings**; submitted via the formal GitHub review API with **COMMENT** status because the authenticated GitHub identity is also the PR author. This is **not** a GitHub-native distinct-account APPROVED review; respect any repository requirement for one.
- Earlier [REJECT/P1 review #5952378687](https://github.com/raisinbran/scrb/pull/352#pullrequestreview-5952378687) applied to `b892852ba3f5c078066ef38fec0b63f436ba3a66`, not the final head. The defect — stale alignment reasserting playback follow after a *completed* jump — was fixed by retiring `jumpToCurrentNonce`, pending motion and alignment state on user takeover.
- The new `TranscriptTab.follow.test.tsx` regression covers an eased jump finishing, user wheel/scrollbar movement, no unwanted re-alignment after later frames, and a new deliberate jump. Other tests cover reduced motion, cancellation, long rows, late resize and far virtualized active words.
- The shared helper retains cubic accelerate/decelerate easing; Live explicitly bounds jumps and follow-along; saved long jumps retain bounded follow-up alignment instead of snapping. The prior synthetic distant-jump failure is not ignored.
- **Nonblocking follow-up risk:** passed runs left approximately 110–130ms margin to the one-second requirement. The existing smoke test asserts <1s only for early targets and uses a looser 5s limit after 60 minutes; despite that, all recorded late targets in this rerun completed under one second. Tightening the long-target assertion would be a separate reviewed test task, **not** a reason to change this exact-head implementation now.

## Mainline reconciliation

- At closeout, `main` was `75151f41aeb73f52d47e6890f1823a0f980cd6f9`, **10 commits ahead** of PR #352's merge base `aea9432e235975adf8c831c3c08a758661d54366`.
- GitHub reports `mergeable=true`, `mergeable_state=clean`. Comparing intervening `main` changes found no modifications to the scrolling helper, affected transcript UI modules/tests, or synthetic jump-performance test. The implementation PR is still behind main; check mergeability and required checks again before any authorized merge.
- A documentation-only accounting branch was created from the latest `main`. **Do not append its accounting files to PR #352** or otherwise change the already verified code HEAD for administrative recordkeeping.

## Separate usage accounting and remaining authorization

- Historic unpublished triage row published under `agents/usage-log/2026-11-18-pr352-ci-triage.md` on the dedicated documentation branch.
- Current independent-review/closeout row published separately under `agents/usage-log/2026-11-18-pr352-independent-closeout.md` on the same branch.
- Device/surface: ChatGPT Chat using cloud GitHub integration; model GPT-6. Effort and quota meters were not available to the task; the earlier triage session's exact PT start/end readings were not captured. They are explicitly marked unavailable rather than guessed; the retrieved GitHub comment publication time is **not** a task boundary.
- No new incident was established for the separate triage or closeout session. Earlier implementation/CI-induced incidents A-760–A-763 remain documented in PR #352.
- **Administrative acceptance:** the separate documentation PR requires its own successful CI, an independent formal review, and owner merge authorization. The original PR #352 also requires owner authorization, and any native distinct-account approval mandated by repository policy. **Neither PR is authorized to merge by this handoff.**
