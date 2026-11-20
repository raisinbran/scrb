### A-870 — 2026-11-19 — W10 — bounded packaging lookup included an absent README path

- **Status / attribution:** Confirmed diagnostic-command error while locating Windows packaging dependencies; no repository state changed.
- **What failed:** A bounded `rg` query included a root `README.md` path that does not exist in this checkout, so that part of the lookup returned a file-not-found error.
- **Impact:** One unnecessary diagnostic error; no source, package, CI, installation, or user data changed.
- **Correction / remaining risk:** Continued with existing package scripts and the known packaging plan paths. Low.
- **Publication:** Local and unpublished in `agents/incidents/`; included in the W10 installer-smoke reporting PR branch.

