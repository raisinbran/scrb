# Split speaker: overlap refusal has no contract code

`splitSpeaker` and `reassignSpeaker` refuse a selection that would also move words the user did not select (adjacent segments overlapping in time). The contract has only `conflict` for this, so main (`meetings.ts`) now sends `conflict` with the message `These words overlap other speech.`, and the Split dialog matches that exact message to skip the passage and list it. The old "selected speaker or text changed" wording stays only for real stale conflicts.

Ask for the owner: a dedicated error code (for example `overlap`) would replace the message match. Needs a `packages/contracts/APPROVALS.md` row; not done here.
