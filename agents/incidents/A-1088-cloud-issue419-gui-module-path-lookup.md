### A-1088 — 2026-11-22 — cloud — Windows GUI module lookup used wrong extension

- **Attribution:** Self-induced read-only file lookup error during #419 current-main source preflight; not a Windows installer, CI, Scribe or GitHub host failure.
- **Observed:** Attempted to read `scripts/win-installed-app-readiness.ps1` on `main`, which does not exist; GitHub returned 404. The reviewed installed GUI source is the **PowerShell module** `scripts/win-installed-app-readiness.psm1`.
- **Effect:** One unnecessary read-only lookup and small avoidable coordination cost. No branch, workflow, key, private data, artifact, production source, model or Windows host was changed by the failed lookup.
- **Correction:** Fetched the exact `.psm1` file and independently confirmed its existing renderer/first-run GUI readiness checks. In the preflight comment, preserved its verified Git blob identity and did not claim a real installed GUI PASS.
- **Prevention:** Locate repository source filenames from the main tree or an existing reviewed dependency before reading a similarly named path.
- **Number reservation:** A-1088 absent from current-main incident tree and all 40 then-open PR changed-file inventories checked. Unpublished host-local reservations cannot be certified clear; if a distinct collision later appears, reconcile under #358 while preserving both events.
