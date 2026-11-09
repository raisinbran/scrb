# PR 74 preflight history and tracker note

These records are operational history, not freeze inputs. Earlier failures A-013 through A-019 remain in the preparation README, with no erasure or relabeling. Raw diagnostics stay outside Git.

## Preserved prior records

```json
{
  "candidate_build_and_verification": {
    "commit": "553dd9080f452f8a54ccff5cd5fea8d6937438ae",
    "branch": "rosmont/gate3-upstream-diagnostics-20261107",
    "source": "git archive of pinned commit",
    "production_modified": false,
    "build": "FAILED_ELECTRON_BUNDLE_ACCESS_DENIED_AND_ENTRY_RESOLUTION; UI build passed; one owner-authorized continuation attempt; no automatic retry",
    "build_script_corrected": true,
    "corrected_build_executed": true,
    "binary_hashes": null,
    "recording_candidate_change_requires_owner_reverification": true,
    "source_verification": "PASS 358 files; 348 CRLF-only differences; binary bytes exact and text CRLF normalized to LF on both sides"
  },
  "operational_records_moved_from_manifest": {
    "publication": {
      "preparation_branch": "rosmont/windows-gate3-retest-preflight-20261108",
      "base": "6297862",
      "draft_pr": "https://github.com/raisinbran/scrb/pull/74; draft confirmed; continuation publication blocked pending renewed connector exception",
      "guard_failure": "Existing pdev2 tool failed to compile on Windows: syscall.Flock/LOCK_EX undefined",
      "independent_review": "PENDING",
      "comment_checker": "UNAVAILABLE; Python-rule wrapper depends on missing checker",
      "syntax_checks": "PASS Node mjs, PowerShell parser, Python compile",
      "eslint": "PASS build-candidate.mjs"
    },
    "usage_and_handoff": {
      "assignment": "W-G3-V3-PREP-20261108",
      "start_pt": "2026-11-08 16:52:10 PST",
      "five_hour_remaining_start": 98,
      "weekly_remaining_start": 100,
      "five_hour_reset_pt": "2026-11-08 19:15:48 PST",
      "weekly_reset_pt": "2026-11-15 16:43:52 PST",
      "model_effort": "Codex; exact model and effort unavailable",
      "surface": "Windows Codex desktop",
      "overlapping_usage": "unknown; no subagents spawned",
      "tracker_row": "PROPOSED_NOT_COMMITTED; final readings in chat",
      "incidents": "A-013 through A-017 proposed in scripts/gate3-retest/README.md; not entered in agents register",
      "next": "Stopped per explicit owner instruction after failed owner render. Further diagnosis or a corrected attempt requires a new owner instruction; publication remains blocked pending renewed exception.",
      "end_observation_pt": "2026-11-08 17:04:49 PST",
      "five_hour_remaining_end": 87,
      "weekly_remaining_end": 98,
      "observed_decrease_pp": {
        "five_hour": 11,
        "weekly": 2
      },
      "attribution": "account-wide rounded changes; same reset windows; overlap unknown",
      "test_retries": 0,
      "final_acceptance": "inconclusive",
      "proposed_tracker_row": "| 2026-11-08 | Codex / Windows desktop | W-G3-V3-PREP-20261108; incomplete preparation; no recording; preflight blocked | 16:52:10 PST | 17:04:49 PST | 98% -> 87% | 100% -> 98% | 11 / 2 account-wide | Preparation / exact model and effort unavailable | 0 test retries | inconclusive | get_usage_limits; resets 2026-11-08 19:15:48 PST / 2026-11-15 16:43:52 PST; overlap unknown; manifest and README contain handoff; row proposed not committed to tracker |"
    },
    "continuation_20261108": {
      "start_pt": "2026-11-08 17:20:14 PST",
      "five_hour_remaining_start": 83,
      "weekly_remaining_start": 97,
      "model_effort": "Codex Windows desktop; exact model/effort unavailable",
      "overlap": "unknown",
      "build_attempts": 1,
      "automatic_retries": 0,
      "phase": "STOPPED_AFTER_OWNER_RENDER_FAILURE; no assembly, source audit, listening approval, routing work or recording",
      "evidence": "Private normalized-verification-20261108.json and build-corrected-20261108.log retained",
      "new_incident": "Proposed A-019: agent-supplied renderer failed its required bookmark-count guard in owner normal-PowerShell run; owner time spent, one incomplete source artifact retained; cause unresolved, no application defect; no retry",
      "owner_render_attempts": 1,
      "end_observation_pt": "2026-11-08 17:22:32 PST",
      "five_hour_remaining_end": 81,
      "weekly_remaining_end": 97
    }
  }
}
```

## Attribution correction

The November 8 17:20:14–17:22:32 PST continuation used Codex Desktop, `gpt-6.1-sol`, low effort, as verified by its per-turn session metadata. The older unavailable entries above are retained as historical reports, not current findings. No private session logs or identifiers are published.

## Current source-only correction

Owner-authorized scope implements review 5820782468. No synthesis, build, recording, playback or audio test ran. Deterministic checks only. Independent review of the corrected source remains pending. The previously granted connector exception created PR 74 only; no new exception has been granted, so continuation publication is blocked. The PR stays draft.

A-020 and A-021 are proposed in the README for the prior source-coverage omission and the corrected floating-point false failure in the new development tests. No physical evidence was affected.

## Proposed current tracker row

| 2026-11-08 | Codex Desktop / Windows | PR74 source-only corrections; deterministic checks pass; execution unverified | 18:22:00 PST | 18:29:32 PST | 78% -> 72% | 97% -> 96% | 6 / 1 account-wide | Source edits / gpt-6.1-sol / low | 1 corrected deterministic-check rerun; no physical retries | pending independent review | get_usage_limits; per-turn model metadata 18:21:51 PST; resets 2026-11-08 19:15:48 PST / 2026-11-15 16:43:52 PST; overlap unknown; no subagents; proposed, not entered in agents tracker |

Checks: all twelve synthetic metadata tests PASS; changed Python syntax PASS; PowerShell parsing and embedded C# compilation PASS with no renderer invocation; Markdown/JSON formatting and whitespace checks PASS. Python/PowerShell dedicated linters and the required comment checker are unavailable; no install attempted. Review of the corrected source remains pending. Weekly observed decrease is one percentage point, below the task budget.

## Bookmark encoding source correction

A-019 evidence: 17/32 marks unchanged over 47 polls through 5002 ms, all starts and only final end, no duplicates; callbacks arrived within about 15 ms. Adjacent-mark suppression remains a strong unproven hypothesis. AudioPosition and exact sample coordinates, not callback wall time, define timing. No application defect is alleged. All prior incidents A-013 through A-021 remain intact. Proposed A-022 records branch-inspection/patch and wrong-runtime syntax-check mistakes, corrected without physical execution.

Source-only checks: eighteen metadata-only tests PASS, Python syntax PASS, Windows PowerShell 5.1 parsing and C# compilation PASS with no renderer invocation. Dedicated linters/comment checker unavailable. No synthesis, WAV generation, acoustic test, build, recording or playback executed by the agent. Both real voice probes, actual source coverage, waveform/listening review and independent source review remain pending. No connector exception was renewed; publication blocked, PR stays draft.

Proposed row (not entered in agents tracker):

| Date PT    | Agent / model / effort            | Task                     | Start / end observation PT | 5h remaining | Weekly remaining | Retries / status                                                               | Notes                                                                                                                       |
| ---------- | --------------------------------- | ------------------------ | -------------------------- | ------------ | ---------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| 2026-11-08 | Codex Desktop / gpt-6.1-sol / low | PR74 bookmark source fix | 18:42:12 / 18:50:23 PST    | 68% -> 61%   | 95% -> 94%       | corrected deterministic verification attempts only; pending independent review | Same resets Nov 8 19:15:48 PST / Nov 15 16:43:52 PST; overlap unknown; account-wide decrease 7/1 pp, not isolated task cost |
