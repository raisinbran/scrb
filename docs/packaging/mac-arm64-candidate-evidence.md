# Mac ARM64 Packaging Candidate Evidence

This record preserves the verified build-only candidate evidence for the packaging changes in this PR. The candidate was built from source baseline `e0ff737f3b928283f53cd9abbd1b294bbe90e584` with the packaging changes under review. The provenance format corrections in this PR were validated with focused tests; they were not used to rebuild the candidate.

## Candidate Results

- Bundle identity: `com.raisinbran.scribe`, version `0.1.0`.
- Architecture and signing: single-architecture ARM64; ad-hoc nested signing and deep bundle verification passed.
- Size: approximately 332 MiB.
- Runtime inventory: 8 executable tools and 17 bundled dynamic libraries, all 25 verified as ARM64, with 90 dependency edges recorded.
- Notices: the project notices, transcription notices, and 10 required license files were present and hashed.
- FFmpeg: LGPL build; the non-network configuration check passed, and no GPL or nonfree build flags were enabled.
- Candidate manifest SHA-256: `c9cf88c1fb19d62e5d50f36afbef6d6f0a4c49ceb5c752216c69570470acc5a2`.

The candidate was not launched, installed, or used for recording or transcription. The installed application and its byte-identical rollback copy were preserved. A rollback rehearsal was not performed, and this is not a final release-candidate approval.

## Pinned Upstream Revisions

| Source      | Revision                                   |
| ----------- | ------------------------------------------ |
| whisper.cpp | `284029c07012d2000941a08d38a31ffb71f4734e` |
| sherpa-onnx | `af2d8d81dbfa61c4cea4c568da78f3982edca005` |
| llama.cpp   | `369dcf309c8b274370e692ac2d42d9708597ae04` |
| Opus        | `251d657e92fccfa3b05baec4f05756cce252fb75` |

## Packaged Source Artifact Hashes

These SHA-256 values identify the source artifacts observed in the candidate. The final PR head records source and dependency lineage in `PROVENANCE.json` when a package is built.

| Artifact                      | SHA-256                                                            |
| ----------------------------- | ------------------------------------------------------------------ |
| `scrb-capture`                | `4caac093f1d39e6dd5b6ceb511c27ded84a7afd184337ad93322369b9584788a` |
| `whisper-cli`                 | `1352dbadb8c2240bcf9789335ee88608c45d3247ded5f640a7abb61ee50dffff` |
| `whisper-server`              | `3dd58507f99e98c10ad9eb3f7e5932cf01dbe0d4bccd55e8008fc9105d108d05` |
| `whisper-vad-speech-segments` | `c66f9a2317fe739390af544f331c1112040d8a4a60e6e7d62de9f58c8bc0df61` |
| `scrb-sherpa`                 | `36cf1487df1de4445d9aabfabd72c24fade835b40e795e6364321246e5a4e95f` |
| `ffmpeg`                      | `59a0100524ad30c4e56d65d619540cbc955c1e5ca4a75e302ca03f0e19ab5921` |
| `ffprobe`                     | `bff190f68b8e2afce951d8c06ab5c9203002e34d77c2d69c184fa35146736e5b` |
| `llama-server`                | `c219a2cde966323d872a73938ec2ef9f23a4a9ddd1dba7876bae58541caf690a` |
| `sherpa-onnx-c-api`           | `f0adaf11e08e0f3df2458e3fd4ea6aab215953e423e55b567f601ea6eb3530f3` |
| `onnxruntime`                 | `b0613d0ae53199a83b05fa48e169211498e9d40d54beaa372068ebe5ec5b0929` |

## Scope And Limits

The candidate manifest from the build session included raw probe output. The PR changes provenance output to store probe status, expected-pattern result, and output SHA-256 without embedding raw stdout or stderr. The source-change digest now covers untracked source files as well as tracked diffs, and changed tracked paths are parsed without slicing porcelain status columns.

No app bundle, binary, model, raw log, or machine-specific filesystem path is included in this PR.
