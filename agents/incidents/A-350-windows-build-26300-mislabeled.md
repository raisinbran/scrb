### A-350 — 2026-11-13 — Codex / Windows PC — Windows 11 build 26300 misreported as Windows 10

- **Status / attribution:** Confirmed agent error; no repository defect.
- **What failed:** In the prior packaged-app report, I treated the registry `ProductName` value (`Windows 10 Home`) as definitive and reported Windows 10, despite the observed version 26H2 and build 26300.9974. Build 26300 is Windows 11 26H2.
- **Impact:** I misstated the tested operating system and the user had to correct the report.
- **Correction / remaining risk:** Corrected the report after checking Microsoft’s Windows release information and recorded the correction in raisinbran/scrb issue #192. Low.
