### A-1128 — 2026-11-23 — Claude Code — agent-named branches and a misrecorded owner decision

- **Agent:** Claude (Claude Code; Opus 5.5 on the Mac for the 2026-11-23 items; the Nov 11 session for PR #86)
- **Status:** confirmed; corrected on 2026-11-23.
- **What happened:** (1) Claude created `claude/vocab-focus-test-waitfor-20261111` (PR #86) and `cuc/claude-resumption-plan-20261123` (PR #459). Both names exposed the agent, against the owner's deliberate non-agent-specific branch naming. The owner's prefix for Claude is now `cod/`. (2) In #459 Claude recorded correction C2 as "Dropped (owner)" after the owner had only said they did not understand it. (3) Two attempts to rename branches through the GitHub rename API returned 404; the work used copy-and-delete instead.
- **Impact:** agent names were visible in branch names; the quality record misstated an owner decision on main until this fix; two wasted API calls.
- **Correction:** branches copied to `cod/` names at the same commits and the old refs deleted (#86, #458, #459); #460 replaced by #461 on `cod/scrb-naming-20261123`; C2 row now gives the recommendation and leaves the decision to the owner.
- **Remaining risk:** about 140 older `cuc/` branches remain (the earlier prefix); renaming them is an owner decision.
