### A-593 — Full test suite blocked by sandbox loopback restriction

- **Status / attribution:** Confirmed test-environment restriction; not an application defect.
- **What failed:** `npm test` reported `listen EPERM` on `127.0.0.1` in untouched worker/live-feed tests; a live worker test reached its 30-second timeout.
- **Agent-controlled cause:** None established. The full suite was requested, but this sandbox does not permit the required loopback listener.
- **Impact:** The broad run was stopped after failures appeared; it was not rerun. Focused transcript tests passed.
- **Evidence:** Sanitized record at `/private/tmp/scrb-transcript-jump-evidence-20261116.md`.
- **Correction / prevention:** Do not retry in this sandbox; exact-head CI is needed for the full suite result.
