### A-1057 — PR #423 authoring introduced an exact-optional TypeScript test error

- **Date / effect:** November 22, 2026 PT. Automatic exact-head macOS CI run #45006197707 failed at npm run typecheck with TS2375 on TitleBar.test.tsx:131. The test passed processingBackend as Backend | undefined even though BackendProvider declares the optional property as Backend under exactOptionalPropertyTypes. This blocked subsequent UI tests; the Windows typecheck was still running when the diagnostic was inspected. The separate native Windows source build succeeded.
- **Attribution:** Self-induced regression-test TypeScript error in this cloud-authored V1 UI PR; not a product/recording failure.
- **Cause:** The new test-view helper forwarded an explicit undefined to an optional JSX prop instead of omitting the prop or supplying a concrete Backend.
- **Correction:** Commit 70297d90 supplies realProcessing ?? backend, retaining the intended default context semantics and satisfying the exact prop contract. No production behavior, IPC or status threshold was changed to mask the failure.
- **Acceptance:** Corrected exact-head CI must pass, followed by an independent different-session formal GitHub review and owner-only merge authorization. No manual workflow rerun or native test requested.
- **Collision / privacy:** Public main and indexed open PRs used A-1055 on #417 and A-1056 on #418; A-1057 had no hits at the observed check. Unpublished host-local reservations remain unverified. No private audio, models or identifiers used.
- **Usage:** One revised twelve-column usage row on this draft PR branch. Percentages unavailable; no exact task cost inferred.
