### A-922 — 2026-11-20 — W10 — Git rejected the original checkout as dubious ownership

- **Status / attribution:** Confirmed agent/environment interaction; no repository state changed.
- **What failed:** A read-only Git inspection of the separate original checkout stopped on Git's safe-directory ownership check.
- **Impact:** The intended read could not be completed with the initial command.
- **Correction / remaining risk:** Retried only the read with a per-command `safe.directory` setting; no global configuration or checkout contents changed. Low.
