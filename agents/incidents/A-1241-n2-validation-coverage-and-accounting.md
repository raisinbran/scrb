### A-1241 — 2026-11-28 — ChatGPT — N2 validation coverage gap and accounting follow-up

- **Agent:** ChatGPT (GPT-6.2, cloud chat)
- **Attribution:** Confirmed self-induced omission in initial PR #551: new weight override and calibration entry point lacked behavioral coverage. The review also identified parallel PR #550 reserving A-1239; collision was not caught before review. This session also probed the wrong ESLint config filename once.
- **Evidence:** Independent review of head 29855846 (review 6096820017), parallel PR #550's incident files, and one 404 for eslint.config.js. The preceding Windows smoke retry task deferred its usage row and did not capture its exact start time; usage is not reconstructable.
- **Impact:** Independent review rejected #551 despite green CI; additional correction and verification required. No private data, model run or physical-machine work.
- **Correction:** Add focused behavioral and exact-entry-point unit tests in the existing outline test directory; keep the original inconclusive result and default scorer intact. Move the original incident to A-1240 after checking main and open PR reservations, correct its usage-row reference, and publish a separate row for the deferred retry task. Record unavailable readings explicitly.
- **Remaining risk:** Exact-head CI and independent re-review pending. A real local checkout remains inaccessible; no claim that the new tests have already passed. Keep N3–N5 held.
