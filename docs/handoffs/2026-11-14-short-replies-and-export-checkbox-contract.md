# Short replies setting and export checkbox: contract needs (owner approval required)

Plan: `docs/plans/overlap-chronological-order.md`, section 8 ("Possible later item") and the export decision of 2026-11-14. Not built, because both need `packages/contracts/` changes the owner has not approved.

## Needed contract additions

1. A display setting `shortReplies: 'show' | 'hide'` (default `'show'`) in the settings types, validators, preload and main allowlists, and the mock backend. It hides only filler backchannels (1-2 words from a fixed list: yeah, yep, mm-hm, uh-huh, right, okay, ok, sure, ...) at display time and never deletes data. Substantive short words (yes, no, agreed, correct, numbers, names) are never in the list.
2. An export option, for example `keepShortReplies?: boolean` on the export request. The export dialog always shows a checkbox "Keep short replies"; it starts at the screen setting when the first Export button is clicked, and toggling it affects that export only. With the field absent, exports follow the screen setting.

## Work once approved

- Backend: filter in `resolveDisplay` (or the transcript page builder) and in `packages/export`; the summary must not treat hidden text differently from shown text.
- UI: setting control in Settings, the transcript view reading it, the export dialog checkbox.

Re-process (the other part of the task) needed no type change and is built separately.
