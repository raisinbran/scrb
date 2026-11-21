# Independent reviewer assessment: ChatGPT Chat (2026-11-14)

**Status:** Claude's observations from one planning/QA session on 2026-11-13 to 2026-11-14. Not a benchmark and not independently reviewed. Intended as input to [agent_task_allocation.md](agent_task_allocation.md); the owner decides what, if anything, moves into the policy.

**Sample:** formal GitHub reviews on roughly 15 PRs (#171 to #222) and QA of about six hand-written Windows/Gate 8 prompts, as relayed by the owner.

## Strengths (use for these)

- **Finds real defects with concrete counterexamples.** Examples: #210 identical neighbouring words let a correction land on the wrong occurrence; #221 an override across different owners; #216 duplicate incident numbers; the Gate 8 prompt lacked a defined tone check and named the wrong approved machine. Most findings were reproducible from the diff.
- **Checks facts before ranking.** It cites CI run numbers per platform and per head commit, states what it did not run, and separates "fixed", "remaining" and "unverified". It caught that `check:register` is not run by CI.
- **Catches plan and prompt gaps.** Machine-specific approval, undefined "tone check passed", missing launch confirmation, non-deterministic branch update. Corrections were small and correct.
- **Rule-compliant and unflattering.** It keeps to "independent review", did not push or merge, and does not soften a reject.
- **Cheap for us.** It consumes no Claude or Codex allowance; best used for diff, plan, prompt and document review that needs only repository text.

## Weaknesses (guard against these)

- **One defect per round, then reject again.** #221 received reject verdicts on at least four successive heads, each naming a new, narrower false-override case in the same family (different owner, different verb, different object, word order). Each fix was the "smallest fix" it asked for, which invited another patch. #210 was rejected at least twice the same way. The cost was several sessions and rounds, not one thorough pass.
- **No weighting by real-world likelihood.** Constructed edge cases (for example "launch Alpha before Beta" vs "not launch Beta before Alpha") were ranked P1 with no estimate of how often meeting data produces them, and without comparing the risk with the feature's measured recall (74% tuning, 68% held-out, target 80%).
- **Cannot execute.** It could not replay evaluations, run the UI, use hardware, or confirm Electron behaviour; it says so each time. Its verdicts say nothing about those.
- **Anchored on the diff.** It does not ask whether a heuristic should exist at all, or propose removing it after repeated failures.
- **Output form.** Links carry tracking parameters; long tables repeat what the PR says. Minor.

## Allocation guidance

| Use ChatGPT Chat for | Do not rely on it for |
| --- | --- |
| Diff review of UI, storage, and contract-boundary changes | Anything needing a run: native capture, Windows/Mac hardware, long tests, numbers it must reproduce |
| QA of prompts, plans and runbooks before they go to an executor | Deciding whether a heuristic is worth keeping |
| Register, incident and usage-row integrity checks | Quality judgments that need the owner's real meeting data |

## Review protocol to ask for (reduces rounds)

1. **Round 1 must list every defect it can construct for the same family**, as a table with a severity and a one-line likelihood in real meetings, not only the first one.
2. **Rank by real risk.** A P1 needs a plausible real-data trigger or a data-loss/privacy/security effect; a constructed case with no plausible trigger is P2 and does not block merge.
3. **Stopping rule for heuristics:** after two reject rounds on one feature, the author reports every remaining known failure mode and the reviewer decides approve-with-known-limits or remove the feature. No third patch round on the same rule without owner approval.
4. **Author states what the check cannot see** (no execution, no hardware) so the reviewer's limits are not mistaken for assurance.
5. Keep "independent review" wording in PR text; never name the agent.

## Unknown

No timing, token or quota data exists for ChatGPT Chat here, and its accuracy on code outside this repository is untested. Revisit after more reviews.
