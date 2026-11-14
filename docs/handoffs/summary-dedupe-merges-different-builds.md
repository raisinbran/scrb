# Summary dedupe merges two different tasks that differ in one word

**Found in review of the Gate 6 reconcile PR. Not fixed there. Owner: backend (`packages/summary/src/dedupe.ts`, existing code, not changed by that PR).**

## Failing case

With the current `dedupe()`, two actions by the same owner 60 seconds apart:

- "Alice will ship the iOS build for review" (100 s)
- "Alice will ship the Android build for review" (160 s)

come out as **one** item (checked by calling `dedupe` on both). Their remaining words match (and the 60-second window lowers the bar), so the one word that distinguishes them is outweighed. The surviving item keeps the other's line in `alsoAt`, so the Android task is no longer a separate row.

## Why it matters

A lost task in an action list is worse than a repeated one. `dedupe` has a negation check and an owner check but nothing that says a differing word is the point of the item.

## Proposed fix (not done)

In `sameItem`, when two items are nearby in time and each has at least one content word the other lacks, treat the pair as the same only if the unshared words are a single stem difference or stopword-like (for example a number word); otherwise keep both. Add the case above as a unit test in `test/units.test.ts` next to "keeps distinct items that share only framing". Measure on the tuning set first (the first-pass dedupe sets the item counts every Gate 6 number depends on), so expect a small rise in item count and re-score before and after.
