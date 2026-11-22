### A-1070 — 2026-11-22 — cloud #419 source audit — producer timeout budget initially oversubscribed

- **Observed issue:** The original draft single-runner workflow had independent step timeout ceilings that together could exceed the approved 105-minute source-build phase, even though a final `Prepare` elapsed-time check and the overall 130-minute job timeout existed.
- **Cause:** Per-step limits were chosen independently without first summing the upper bounds for preflight, checkout, setup, build, unpacked packaging, NSIS, preparation, consumer and cleanup.
- **Effect:** Source-only design uncertainty before independent review; no genuine manual dispatch or long runner was executed.
- **Correction:** Set explicit individual step limits summing to **105 minutes** for the nine producer/preparation steps and **25 minutes** for guard, consumer, cleanup and final summary, with the existing 130-minute hard job cap. Added a deterministic static regression of the exact budget vector.
- **Residual:** Hosted runner scheduling and cancellation overhead are not precise wall-clock guarantees; the on-run 105-minute elapsed guard remains fail-closed. Successful genuine runtime still requires separate owner permission.
