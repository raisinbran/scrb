### A-515 — 2026-11-15 — Codex / Mac desktop — initial test launch could not use loopback fixtures
- **Status / attribution:** Confirmed environment/setup error. No product defect.
- **What failed:** The first Vitest launches ran inside the restricted sandbox even though the downloader tests bind their fixture server to `127.0.0.1`. Setup hooks timed out while opening the local server.
- **Impact:** Three focused test launches stalled or timed out before the permission issue was identified.
- **Correction / remaining risk:** Re-ran the existing local-only tests with the approved sandbox network permission; targeted and full suites passed. No external host was contacted. Low.
