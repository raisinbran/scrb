# Export summary adapter: remaining gaps (2026-10-30)

- [x] **From and to:** backend (`packages/app-core`) to the owner, for decisions on the items below.
- [x] **What changed:** `toExportSummary` maps `SummaryFile` v3 to `ExportSummary`. Nothing was changed in the contract, the file format or `packages/export`.
- [x] **Contract items affected:** none yet. Gap 1 needs a contract change if adopted.
- [x] **Backend areas affected:** `packages/app-core`, and on approval `packages/summary`, `packages/storage`, `packages/export`.
- [x] **How to test:** `npm test`, `packages/app-core/src/export-summary.test.ts`. It runs the adapter's output through the real export layout.

## Stopgaps in the adapter

1. **`impactInferred`: every decision with an impact area prints "(inferred)".** The engine gives a decision an area but no stated-or-inferred basis, and only impact items have one. Showing the area plainly could present an inference as confirmed, so the adapter marks all of them. Stated areas, and areas a user set by hand, are over-labelled until this is fixed.
   **Needs:** a basis on engine decisions, a new field on `Decision` in format v4, and the same field on the contract's `DecisionItem`, because `applySummaryUpdate` replaces the stored item with the one the UI sends and would drop it.
2. **`criticalDecisions`: all decisions with status `decided`.** The file has no "critical" mark. This is the rule `packages/summary/src/render.ts` uses. Items with `needsReview` are included, as they are there.
3. **`projectDevelopments`: lines of the `full-impacts` section, with `sourceMs: null`.** The file keeps impacts only as narrative text, so the engine's timestamps are lost and these lines print no source. Requirements say every item links to a timestamp. Inferred lines keep their "Inferred:" label because `ExportSourcedItem` has no flag.
   **Needs:** a format change that stores impacts as items, if source timestamps are wanted here.

## Not exported

Each of these needs a new field in `packages/export`, not a contract or format change.

- **`warnings`:** the contract says these are always shown, but an export omits them, so a document can leave out unread parts of a meeting without saying so. This one should be fixed before export ships.
- **`needsReview`:** weakly supported or conflicting items print like any other.
- **`alsoAtMs`:** only the first source of a merged duplicate prints.

Not meant for a document: `id`, `edited`, `generatedAt`, `revision`, `transcriptRevision`, `meetingId`, `schemaVersion`.

Headings on the overview and impacts sections are also not printed, because the layout uses fixed headings. A heading a user changes there does not reach the document.

## Storage bug found

`upgradeDecision` in `packages/storage/src/formats/summary.ts` turns a v2 `impactArea` of "not specified" into `notSpecified`, not null, which breaks the `ImpactArea | null` type. It also keeps the case of its input, so a capitalised status such as "Decided" would stay capitalised. The adapter reads an unknown area as null, and a test covers this. An unknown decision status is not handled and would fail in the export layout. The contract's `toSummaryDoc` passes the same values to the UI. The upgrade was left alone because this work stays out of the file format.
