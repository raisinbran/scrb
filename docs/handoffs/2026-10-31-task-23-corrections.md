# Task 23 — correction reassignments and final-pass history

**Base main:** 7790843. **On branch:** `reassignSpeaker` handler uses original word spans, library's locked write, conflict refusal and committed revision events; final-pass merge retains only correction-history entries whose referenced frozen IDs remain in the saved model layer.

## Outstanding

- Safe rebasing of **speaker** undo history through a final pass needs an explicit speaker/override ID mapping; current patch filters these entries rather than risking invalid Undo.
- A truly stale selection cannot be distinguished solely by word endpoints unless the request includes a transcript revision; the existing contract has no revision argument. Recommendation: propose `expectedRevision?: number` in the next correction contract review, not silently edit at a guessed time.
- Add tests for concurrent live updates between the handler's read and the locked write, correction spanning segments, wider correction absorption, and full restart/finalization history.
- Main-process tests and `npm run check`, smoke, real models and native tests **not run**. Primary agent should validate correction precedence and all frozen-span cases before merge.

No `packages/contracts/` changes.