# Summary outdated because of a re-process (owner feedback item 27)

Contract change approved by the owner on 2026-11-15: `MeetingSummaryDoc.outdatedByReprocess?: boolean`. It is true only when `state` is `outdated` and the transcript was re-processed (final pass re-run) after the summary was generated. Edits alone leave it unset.

Storage: `summary.json` gains an optional `reprocessed` boolean, set together with `outdated` by `applyFinalPass` and cleared when a summary is regenerated. It is saved with the file, so the warning survives restarts. No schema version change (optional field).

UI: the Summary tab shows "This transcript was recently re-processed. This summary may be outdated. Recommend generating the summary again." when the field is true (separate UI PR on top of this one).
