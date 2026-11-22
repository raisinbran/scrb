### A-1035 — 2026-11-21 — Cloud — incident inventory read-only JavaScript parsing error

- **Observed:** The first attempt to collect mainline incident filenames and comparison PR paths used a mismatched parenthesis in its JavaScript orchestration expression and was rejected as a SyntaxError before any underlying GitHub tool operation.
- **Impact:** One unnecessary, non-mutating read attempt; no native build, CI retry, private data, account setting, repository file or Git ref affected.
- **Correction:** Reissued the inventory read with explicit intermediate arrays; checked current main, 38 open PR changed-file lists, the known cloud coordination branch, and published local-reservation reports before selecting provisional A-1031–A-1034.
- **Prevention:** Validate grouping and parentheses in tool orchestration and cap concurrent calls; count self-induced read failures honestly.
- **Publication and boundary:** Recorded on draft #376 with its 12-column dated task row. Unpublished device-local W10/M5/REGIURN reservations remain unknown, so final global incident clearance is not claimed.
