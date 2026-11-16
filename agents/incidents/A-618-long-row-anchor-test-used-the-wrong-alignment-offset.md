### A-618 — 2026-11-16 — Codex / Mac desktop — long-row anchor test used the wrong alignment offset

- **Status / attribution:** Confirmed agent-authored test expectation error; implementation was not implicated.
- **What failed:** The first run of the new ResizeObserver regression expected `scrollTop` 876 px, but the component correctly aligned the word 20 px from the viewport bottom at 644 px.
- **Agent-controlled cause:** I calculated the expected jump using the top-margin branch instead of the component's bottom-margin branch for the mocked word bounds.
- **Impact:** One focused suite attempt failed; the expected value is corrected to 644 px.
- **Evidence:** Focused Vitest output and `TranscriptTab.follow.test.tsx`.
- **Correction / prevention:** Calculate the word's final bounds against both viewport edges before asserting its aligned offset.
