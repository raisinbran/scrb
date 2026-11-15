# SP-08 packaged-build check on Mac — 2026-11-14

**Tested commit:** `57247ec7` (contains PR #240, `65d66536`). **Machine:** owner's Mac, macOS 27.0.1, Apple Silicon. Branch `cuc/sp08-mac-check-e56c79`. No product code changed.

## Agent-run results (plan section 6, step 4)

1. **Build `scripts/package-mac.sh` (build only, no install): pass.** Printed `Built and verified: apps/desktop/release/mac-arm64/Scribe.app (308M)`; took 6.5 s.
2. **`SCRB_PACKAGED_APP=<that app>/Contents/MacOS/Scribe npm run test:smoke -- packaged.spec.ts`: pass.** 1 passed, 0 failed (4.2 s). It includes the `file:///etc/hosts` navigation check, which did not change the address.

## Not done: owner clicks (steps 1–3)

These need a person at the screen and were not run. Nothing was installed over `/Applications/Scribe.app`; the tested app is the build output above.

1. Open the built `Scribe.app` (or run `scripts/package-mac.sh --install`, then open it). **Expect:** Recordings screen with no error banner; Settings shows the library folder; Vocabulary opens. Any "Request refused" is a failure: do not merge.
2. Click **Show mini window**, make a short invented-clip recording (under 20 minutes), stop it, reopen the small window once. **Expect:** works every time.
3. Quit and reopen. **Expect:** same as step 1.

Independent review: pending.
