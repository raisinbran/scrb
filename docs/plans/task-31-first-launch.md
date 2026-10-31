# Task 31 — first-launch models and permissions

**Type:** Plan → Diff. **Base:** main 7790843.

## Workflow

1. Detect missing verified local model files using `getSetupStatus`. Return a deterministic list of model roles, size estimates, installed versions and permission states. Never mark setup complete while a checksum is missing or mismatched.
2. Download on explicit user action via `startModelDownload`, HTTPS to owner-reviewed pinned provider URLs, streaming into a staging file outside meeting folders, with a fixed maximum size and SHA-256 comparison against an immutable manifest. Do not follow arbitrary model URLs received over UI IPC.
3. Atomically publish a verified model once complete; cancellation or crash leaves previous installed models untouched. On restart, resume or safely discard staging; do not treat an incomplete file as installed.
4. `requestPermission`: use the OS-supported native microphone/screen audio prompts only after a user gesture; report `notDetermined`, `granted`, `denied`, `unknown`. Never weaken the Electron renderer permission policy to permit arbitrary browser capture; native helper owns capture.
5. The first-launch UI shows location selection (privacy rule Task 22), model requirements, permission explanations and progress. Allow retry of a failed download. Show an actionable offline message before first setup; after completion, no network is needed for any recording/transcription function.

## Validation

Local fake HTTP server must test valid checksum, corrupt payload, interrupted transfer, oversized/chunked response, server redirect, invalid TLS, missing disk, cancellation, restart and tampered installed file. Test UI reload, permission denial and offline-after-install. Pin model URLs/checksums only after the primary agent verifies legitimate model redistribution and licenses.

**Recommendation:** manifest versioned alongside the app, with no arbitrary remote updates or silent background downloads. **Outstanding:** exact model URLs/checksums, downloader and integration, native OS permissions, installed tests. No npm/OS/hardware checks run.