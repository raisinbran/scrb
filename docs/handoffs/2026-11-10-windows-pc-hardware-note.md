# Windows test PC: owner-reported hardware behaviour (note of 2026-11-10 PT)

**Status:** owner-reported and unverified. Nothing here was measured or reproduced by an agent. This note is an **addendum** to `docs/gates/gate-3-windows-latency-owner-decision-record-20261110.md` and **does not reopen the signed decision**.

## What the owner reports

Since it was new, the Windows PC used for the Gate 3 tests has occasionally shut off its screen and/or its speakers for about 2 minutes. It is rare and follows no pattern the owner has noticed. A second Windows PC is available for checks.

## How this relates to the decision record

- This behaviour was **not** in the risk list of the signed decision record.
- The only evidence that could possibly be related is the unexplained capture event about 106 s into two microphone recordings on this PC: practice chunk 32 and scored chunk 47, each with a few extra decoded samples. Its cause is unknown and it has not been investigated.
- There is no evidence that the two are connected. The screen or speaker dropouts could equally have nothing to do with capture. No scored unit is known to have been affected by a dropout, and nothing in the logs links one to the 106 s event.

## Suggested low-priority check (not run)

On the second PC, run a short capture-only session of 7 to 8 minutes: no scoring, no real meeting audio, test sounds only. Look at whether the extra-sample event appears near 106 s. If it does not appear, the first PC's hardware or drivers become a more likely suspect; if it does, the cause is more likely in the app's capture path. **This check has not been done and should not be started without the owner's decision.**

## Not changed

No pinned file, Development Plan, threshold, manifest entry or allowance proposal was edited, and the decision record's risk list was not edited.
