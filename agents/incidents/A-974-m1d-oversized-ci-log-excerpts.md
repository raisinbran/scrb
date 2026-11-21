### A-974 — 2026-11-20 — M1-D cloud diagnostics — oversized CI-log excerpts

- **Status and attribution:** Confirmed self-induced output-handling mistake during read-only analysis of issues #380 and #395.
- **Observed effect:** The diagnostic script printed extensive overlapping matched Windows CI log excerpts together with library source; the connector tool response was truncated, reducing visibility of the targeted failure evidence. The underlying GitHub logs were not changed.
- **Correction:** Re-read only bounded source ranges and specific test failure blocks, compared passing and failing runs, and posted source-grounded issue comments. No repeated broad CI or physical tests were initiated.
- **Remaining risk:** Low. Future log inspection should cap excerpts and print matched segments rather than each overlapping context. No application code, private audio, or evidence files were altered.
