# Mac release candidate evidence for the next B0 run, 2026-11-27

Scope: build the Mac candidate from current `origin/main`, record its identity. No install, no launch of this build, no audio, no B0 run. The model manifest and tool list are unchanged from [the 2026-11-24 evidence](m1-mac-rc-evidence-20261124.md) (`scripts/model-digests.json` is identical to that SHA; the build verified the same 25 ARM64 binaries).

## Candidate

- **MAC_RC_SHA:** `e2623738118c8635b83b4487dd0a796794204092` (`origin/main`, #540 merge). It includes #530, #539, #540 and #542. PROVENANCE.json: no changed or untracked source files, empty working-tree patch.
- Built 2026-11-27 20:04 PT (`builtAtUtc` 2026-11-28T04:04:17Z) with `scripts/package-mac.sh` (build only) from a worktree; output `apps/desktop/release/mac-arm64/Scribe.app` (333 MB), version 0.2.0, bundle id `com.raisinbran.scribe`, arm64 only.
- Build log ended `Verified packaged renderer matches freshly built dist and includes Copy transcript`, `Verified 25 packaged ARM64 binaries`, and `codesign --verify --deep --strict` passed. Signature is ad-hoc, no team identifier, not notarized.
- Setup note: the worktree lacked the git-ignored `packages/transcription/.bin` and `.work/ffmpeg` archives; both were copied unchanged from the primary checkout (as on 2026-11-24). `npm ci` was used.

## Package identity (full digests, checked at every install step)

| Item                                           | SHA-256                                                            |
| ---------------------------------------------- | ------------------------------------------------------------------ |
| Main binary `Scribe.app/Contents/MacOS/Scribe` | `7145c4ac14a6f2595367ea7efdf973b80ac0121372aa221fc97eda0ed9410a32` |
| Regular files (314), `b0-mac-swap.sh` `files=` | `f34abcc06bdadacb0cb1349698c4c1403570ca5ec14b9f3f1f2da247253c0eed` |
| Symbolic links (14), `b0-mac-swap.sh` `links=` | `30001a5475c519e41407606d1b6bb0d591beaf67820c17cf034053a7395f88af` |

Both fingerprints come from `scripts/b0-mac-swap.sh fingerprint <app>` (method as in the 2026-11-24 evidence: sorted per-file SHA-256 listing, then SHA-256 of the listing; modes, extended attributes and the signature are not included). Ad-hoc signing makes them build-specific: a rebuild differs, so this app path must not be rebuilt before the run. The links digest equals the 2026-11-24 value because the Electron framework links did not change.

## Not done

No install, no launch of this build, no audio played, no B0 protocol, no model-file verification on disk. See [the run sheet](m1-mac-b0-run-sheet-20261127.md).
