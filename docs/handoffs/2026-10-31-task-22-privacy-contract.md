# Task 22 — privacy list contract and backend jurisdiction rule

**Base main:** `7790843`. **Contract type:** exact TypeScript proposal only; do not change `packages/contracts/` before primary-agent approval.

Propose in `packages/contracts/src/backend.ts` `BackendCalls` under Settings:

```ts
getPrivacyJurisdictions: {
  request: void;
  response: { countries: string[]; usStates: string[] };
};
```

Add `getPrivacyJurisdictions: true` to `CALL_TABLE` and `getPrivacyJurisdictions: nothing` to `REQUEST_CHECKS`. The preload/main allowlists derive from `CALL_NAMES`. Add a mock handler returning the local rules file and validation tests.

## Implemented / remaining

A local editable `privacy-jurisdictions.json` is created under the selected library root on first use, starting with EU/EEA, UK, Illinois, Texas, Washington, California and Colorado. A pure `needsPrivacyBanner` function reads the user's chosen US state or OS country and is called before every recording. Invalid editable-file contents fail conservatively to showing the banner. Tests cover listed/unlisted jurisdictions and OS override. The renderer must not independently decide the banner from state heuristics; it uses the backend's recording state.

**Missing:** integration into file-import profile-building flow (Task 18), verified OS location behavior across locale changes, copy packaging defaults, edit-reload UX and legal review of the editable list. Recommendation: make clear this is a reminder, **not** a declaration of applicable law, and let the owner update the list offline. No extra IPC channels and no actual geolocation.

**Not run:** `npm run check`, native/Electron and locale tests.
