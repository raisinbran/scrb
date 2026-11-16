### A-594 — Incident files initially used an unrecognized heading level

- **Status / attribution:** Confirmed; agent-authored documentation format error.
- **What failed:** The first register check reported that each new incident file lacked exactly one recognized A-number heading because the files used `#` instead of the required `###` heading.
- **Agent-controlled cause:** Incident format was not checked against `scripts/check-register-ids.mjs` before the first validation.
- **Impact:** One register-check attempt failed; all four headings were corrected.
- **Evidence:** The four incident files and the first `npm run check:register` output.
- **Correction / prevention:** Use the required `### A-NNN` format and rerun the register check.
