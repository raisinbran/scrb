### A-1055 — 2026-11-21 — M1 preparation used two unsupported GitHub metadata reads

- **Status / attribution:** Two self-induced read-only connector selection errors during M1 release-readiness research; not a repository, application or host failure.
- **Observed failures:** An attempted REST workflow-run listing URL for the Windows installer workflow returned `INVALID_ARGUMENT` because the GitHub fetch action does not accept that Actions endpoint. A separate issue-summary fetch used unsupported argument names and returned `InvalidActionArgumentsError`.
- **Effect:** Two unsuccessful read-only requests. Neither wrote a Git ref, PR, CI run, model, package, user data or private audio. No measurable task-exclusive usage impact is available.
- **Correction:** Used the supported default-branch workflow file, exact-head PR workflow result, and issue #340 comments, explicitly distinguishing guard-only CI from an unverified genuine hosted installer run. Did not repeat either rejected endpoint or infer a historical real run from source presence.
- **Prevention:** Match connector-supported action schemas and fetch URL allowlists before querying; report unqueryable run history as NOT VERIFIED rather than guessing.
- **Publication limits:** At correction, A-1055 was absent from verified current main and accessible open PR filenames; earlier #415 retains a different event under A-1044; no claim is made about unpublished machine-local or unindexed PR incident reservations. Reconcile if a distinct prior event with this ID becomes visible, preserving both narratives under #358.
