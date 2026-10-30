# Speakers, Vocabulary, Settings: contract gaps (2026-10-30)

The UI for these screens is built against the mock. These needs have no contract call or event, so each has a stopgap or is left out. All need the owner's approval, because they change `packages/contracts/`.

| Need                        | Requirement                                           | What the UI does today                                                                                               | What it needs                                                         |
| --------------------------- | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Jurisdiction list           | The list is an editable settings file                 | `lib/us-states.ts` hard-codes the starting US states for the warning, so an edited file would not change the warning | A call returning the listed places                                    |
| OS country                  | "Outside the US, the app uses the OS country setting" | "Outside the United States" stores the region from `navigator.language`, or `ZZ` when it is unknown                  | The backend sets `location.country` from the OS, or a call returns it |
| Pending speaker suggestions | Suggested matches wait for confirmation               | Held in memory by `SpeakerSuggestionsProvider`, so a UI reload loses them                                            | A call listing pending suggestions                                    |
| Privacy banner for imports  | Shows when profile building is on for an import       | Not shown. Only `RecordingState.privacyBannerRequired` exists                                                        | The flag on import progress, or a separate event                      |
| Vocabulary undo and redo    | "Undo and redo work on all edits"                     | Not offered. `undo` and `redo` take a meeting id, and deleting a term asks first                                     | A vocabulary undo history, or a decision that it stays per meeting    |
| New speaker model           | Offer to rebuild profiles from stored meetings        | Warns before install, with no rebuild offer                                                                          | A rebuild call and its progress                                       |
| Try a model first           | Try a new model on a past meeting before switching    | Not offered. Install switches at once in the mock                                                                    | A trial call, and whether a role has a previous version to revert to  |
| Mic test                    | Level meters and a mic test in Settings               | Not shown. `levelMeter` runs only while recording                                                                    | Already listed for the capture work                                   |
| Profile and meeting link    | Split belongs to a meeting, not a profile             | Speakers has a "Speakers in a meeting" picker instead of linking from a profile                                      | A call listing a profile's meetings, if that link is wanted           |

## Decisions the UI made that the backend should check

- Choosing a preset sends the preset and its control values together. Studio also sets `bypassSystemInputProcessing` to true, reading "all processing off" as including the OS. Advanced voice activity is left alone, since it is speech detection and not audio processing.
- Changing noise suppression, echo cancellation, automatic gain control or bypass switches the preset to Custom.
- The mock's split and reassign move whole segments. The real backend splits at the selected words.
- Storage location changes at once through the native picker. The contract does not say what happens to meetings already stored at the old location, so the backend must define that and the UI should then state it.
