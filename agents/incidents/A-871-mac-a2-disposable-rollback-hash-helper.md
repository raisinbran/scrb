### A-871 — 2026-11-19 — Mac A2 disposable rollback helper assumed unavailable xattr API

- **Status / attribution:** Confirmed rehearsal-helper setup error; the installed app was not renamed or written.
- **What failed:** The first disposable swap/rollback helper called `os.listxattr`, which is not available in the host Python. It stopped after copying the installed and candidate bundles into `/private/tmp`, before any simulated rename.
- **Impact:** One failed rehearsal setup and an additional corrected attempt; temporary copies and the candidate archive remained in the rehearsal directory.
- **Correction / remaining risk:** The helper was changed to hash bundle file bytes, modes, paths and symlink targets. A candidate swap and rollback then completed inside the disposable directory and both tree hashes matched. The real installed app and backup were not modified. Low.
