# Task 7 / Task 33 — npm license evidence (preliminary)

**Basis:** `main` at `088b61aa06d31edc5857e023b5d370320f8a0938`, 2026-10-31. This branch is documentation-only and independent of draft PR #8, which is under Claude Code QA.

## Reproducible metadata audit

Run `node scripts/audit-runtime-notices.mjs --json` for the 25 runtime candidates or `node scripts/audit-runtime-notices.mjs --check` to flag missing/conflicting **metadata**. This script has no npm dependencies. The inventory is deliberately a *candidate* set, not a definitive list of bundled components.

| Lockfile | Third-party node_modules entries | Not marked dev/devOptional |
| --- | ---: | ---: |
| Root `package-lock.json` | 320 | 25 |
| `packages/export/package-lock.json` | 96 | 22 |
| `packages/summary/package-lock.json` | 105 | 0 |
| `packages/transcription/package-lock.json` | 125 | 0 |

Across the four files: **445 unique third-party name/version entries**, **8 internal `@scrb/*` workspace links**, **25 unique runtime candidates**, and **0 third-party entries missing npm license metadata**. There are no conflicting license labels for the same name/version in these lockfiles. This refines the older figure of 453, which included the eight workspace symlinks.

The candidate labels break down into **20 MIT**, **2 ISC**, **1 (MIT OR GPL-3.0-or-later)**, **1 (MIT AND Zlib)** and **1 BlueOak-1.0.0**. **Do not flatten OR into AND** or treat composite labels as checked redistribution obligations.

### Notable candidates and primary-source checks

| Package | Pinned version | Metadata | Source to verify against the exact distributed package |
| --- | --- | --- | --- |
| `react` / `react-dom` | 19.3.1 | MIT | [React source license](https://github.com/facebook/react/blob/main/LICENSE) |
| `docx` | 9.11.0 | MIT | [docx source license](https://github.com/dolanmiu/docx/blob/master/LICENSE) (verify the released package's license file) |
| `jszip` | 3.10.2 | MIT **OR** GPL-3.0-or-later | [JSZip published license](https://github.com/Stuk/jszip/blob/main/LICENSE.markdown); maintainer documents the MIT/GPL choice |
| `pako` | 1.0.11 | MIT **AND** Zlib | Verify both obligations against the exact npm tarball and upstream source |
| `sax` | 1.6.1 | BlueOak-1.0.0 | Verify text and attribution from the exact npm tarball |

These links establish where a source-license review can begin; **upstream branch tips are not proof of the installed version's actual notice text**. Type-definition packages `@types/node` and `undici-types` are present in the lockfile candidate set even though type-only data may never appear in the runtime build.

## What is actually shipped today?

**No installable Windows/macOS release bundle is configured on this baseline.** `apps/desktop/scripts/build-electron.mjs` bundles main/preload with esbuild and externalizes Electron; Vite emits renderer assets. Neither script identifies an installer, signed executable, native-helper resources or model files. Consequently **zero dependencies are yet confirmed as shipped in an installer**, not that the final installer will ship zero dependencies.

Even a dependency marked "runtime" in npm can be tree-shaken, embedded, omitted, or compiled into a different asset. In particular, the `docx` graph may enter a future export path; npm metadata alone cannot prove it is packaged.

## Release-blocking evidence still missing

1. Build the exact production Windows and macOS bundles; list bundled JavaScript, Electron, helper executables, fonts/assets, FFmpeg/ffprobe, whisper, sherpa/llama, and models. Hash the shipped artifacts.
2. Read the **actual license files in those exact npm tarballs or resolved `node_modules` packages**, and binary tool build/licensing output (including `ffmpeg -L` and `ffmpeg -buildconf`). Record license text, copyright notices, source links, and applicable source-offer obligations.
3. Check model license/redistribution permission and source URLs against an owner-reviewed manifest. A model download URL by itself does not establish permission to redistribute.
4. Only then produce a reviewed `THIRD_PARTY_NOTICES.md`, an exact bundle-manifest coverage check, and connect `getLicenses`. **Do not populate `getLicenses` with placeholder labels.**

**Scope limit:** This review is metadata plus upstream reference verification, not a legal compliance certification. No real installers, models, native tools or external files were changed. Run the new script and recheck against the installed build before release.
