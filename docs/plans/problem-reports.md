# Problem reports and optional crash reporting

**Status:** proposed, 2026-11-27; base `bfb61ebf`. Post-M1, not an authorization to add networking or change privacy claims. Independent security/design review and owner approval before implementation. A colleague should report a fault in three steps without creating an account.

## 1. Research: established reporting flows

Official product documentation consulted 2026-11-27. Account column refers to submitting the report, not using the product.

| Product / source | Payload | Consent | Delivery | Account needed |
| --- | --- | --- | --- | --- |
| [Sentry for Electron](https://github.com/getsentry/sentry-electron), [scrubbing](https://www.sentry.help/en/articles/13964268-what-are-sentry-s-data-scrubbing-options) | JS errors, breadcrumbs, context, native minidumps | App developer configures collection; app must implement its own user consent | Hosted or managed ingestion endpoint | Maintainer account/project; no reporter account |
| [Firefox](https://support.mozilla.org/en-US/kb/crash-report) | Crash diagnostics | Per-crash submission or separately enabled automatic sending (off by default) | Mozilla crash service; local reports can be submitted later | No |
| [Chrome](https://support.google.com/chrome/answer/14746339) | System, crash-time activity, possible URLs/memory | Usage/crash reporting setting, documented as on by default | Google | No sign-in required for basic reports |
| [Signal](https://support.signal.org/hc/en-us/articles/360007318591-Debug-Logs-and-Crash-Reports) | Low-level diagnostics, not message content | Inspect/edit desktop log, explicitly submit; share link | Support form/email; zipped logs if app cannot open | No separate reporting account documented |
| [1Password](https://support.1password.com/diagnostics/), [contents](https://support.1password.com/diagnostics-privacy/) | App/device/account diagnostics and logs, not vault secrets | Generate on request and attach | Private support email | Email access; no separate issue-tracker account |
| [Obsidian](https://obsidian.md/help/resources) | Debug information | Explicit copy/paste | Forum bug report or support email | Forum login for posting; email alternative |
| [Slack](https://slack.com/help/articles/360001559367-Troubleshoot-Slack-notifications) | Issue description with attached logs; optional network logs | User initiates submission/collection | Slack support, or zip attachment | Workspace context; no separate tracker account documented |
| [macOS](https://support.apple.com/en-euro/guide/mac-help/mh27990/27/mac/27) | Crashes, hangs, hardware/software and analytics | OS analytics permission | Apple (not necessarily the app developer) | No separate reporter account specified |
| [Windows Error Reporting](https://learn.microsoft.com/en-us/windows/client-management/mdm/policy-csp-errorreporting) | Error parameters and potentially additional diagnostics | OS policy ranges from disabled to automatic full submission | Microsoft, governed by OS configuration | No separate reporter account specified |

Take Signal's review, Firefox's separate crash consent and 1Password's private intake, not Chrome's default-on or raw-dump collection. OS reporting is independent and is not a reliable route to the owner.

## 2. Delivery recommendation

No GitHub choice, login, token or link in the reporter UI for anyone; the owner alone operates the tracker. No account creation requirement for colleagues. No support address, endpoint or credentials committed until configured by the owner.

| Route | Benefits | Cost / privacy / abuse |
| --- | --- | --- |
| Owner-controlled HTTPS relay, optional issue creation | In-app receipt; works for background crash envelopes; owner can triage centrally | Low-volume serverless hosting/mail may fit free allowances; budget $0–10/month initially, estimate not quote. Maintenance, secret rotation, spam controls and processor retention required. Public issue creation is irreversible disclosure. |
| Email or private form | Fast to establish; owner receives notification; form can avoid reporter login | Existing mailbox/form may cost nothing; provider processes reports; email client setup/attachments and form upload/login restrictions vary. Spam, quota and delivery failure. No safe automatic crash upload via mailto. |
| Save sanitized zip and send manually | Offline, no backend, works when network blocked | No hosting cost; more user effort; no delivery confirmation. User chooses recipient and protects saved copy. |

**Recommend** implement safe preview/save first and offer a private email handoff initially; then a small authenticated relay for one-click sending and opt-in automatic crashes. For the few invited colleagues, issue revocable per-install invitation credentials (no user account) stored in the OS credential store, not a baked-in shared API key. Relay accepts only a versioned structured envelope; returns a random report ID after durable private receipt; notifies owner's private inbox. No arbitrary attachments, URLs or destination. Owner can opt to have the relay create a public issue from a second, fixed-template, content-free projection after explicit owner review (default off). Use a server-only fine-grained owner token restricted to this repository's Issues:write ([API](https://docs.github.com/en/rest/issues/issues)); never expose it to the client. Prefer owner manually creating sanitized issues for the initial deployment. Do not publish private intake data.

Require TLS, exact origin endpoint/no redirects, size cap (propose 128 KiB uncompressed), schema and enum validation at both ends, per-invitation and IP throttling (e.g. 5/hour/device), global daily cap, idempotency key, deduplication by safe crash signature, bounded backoff, secret rotation/revocation, spending limit and kill switch. Reject malformed/oversized input before persistence; avoid body/token/IP logging (short-lived rate-limit state only). Private receipt access owner-only, proposed deletion after 30 days unless needed for an open fault; document provider access, location and backups before approval. For outages show “Not sent”, allow retry/save; never claim email draft equals delivered.

## 3. Payload and scrubbing: fail closed

Source baseline: `packages/storage/src/logs.ts` has a 14-day local log and key/value filters. Its permissive token regex can still admit a private one-word value or a dynamic event/key; it is **not an upload sanitizer**. `apps/desktop/src/ui/screens/HelpScreen.tsx` currently promises no upload, except external cloud-folder syncing. Update Help/About, manual, first-run privacy text and settings together before enabling any send.

Allowed report: app version/build, OS family/version/architecture (no host identity), coarse hardware/memory class if needed, fixed category/symptom/phase codes, relative timestamps/durations, exit/error codes, bounded recent events (propose last 200 allowlisted events in 24 h), explicit safe setting flags (booleans/enums such as recognition quality and audio profile, never device names, paths or location). Generate locally from typed values; whitelist events, field names, enumerated values and numerical ranges, never serialize raw exception/error messages, settings objects or existing logs. Optional symptom wizard uses fixed choices; no free-text box, clipboard, screenshot or arbitrary attachment in the app's send path. Preview exact envelope and save the identical bytes in a generic-name zip with a fixed internal JSON entry.

**Never include** transcript text or excerpts, meeting/recording content, audio, filenames/paths, titles, vocabulary/mishearings, speaker names/voiceprints, embeddings, IDs linked to meetings, usernames, device labels, credentials, environment variables, URLs, raw stack strings, database copies, native crash dumps or raw logs. Do not assume hashing sensitive names makes them safe. This applies to payload, envelope metadata, zip names, relay logs, receipt notification, public issue and retry queue. The owner may discuss a problem separately using approved non-confidential channels, but not attach real meeting material.

Automated tests use invented canaries (including single-word values that pass the current filter), escaped/encoded Unicode, nested values, dynamic keys/events, paths on both OSes, error messages, unknown events, JSON injection, malicious archive entries, oversized/malformed reports and transport retries. Decode and search exact outbound bytes, archive contents, server-side storage/logs, errors, receipt/email and projected issue. Verify each prohibited category is absent, preview equals sent bytes, invalid schema fails without network, no egress before consent or after revoke, and normal diagnostic fields survive. Use a fake endpoint and packet/HTTP capture; any leak blocks delivery. Repeat on packaged Windows/Mac, including crash while recording with invented content.

## 4. UI, crash safety and contract

Help → **Report a problem** → choose problem/when → **Review report** → **Send to owner** or **Save report**; optional diagnostic inclusion checkbox default off. Cancel discards preview. Show recipient/service and retention before send. Suggested text: “Send this technical report to the app owner? It includes app/OS versions and the diagnostic information shown below. It does not include meeting content, recordings, names, file names or vocabulary. Nothing is sent until you choose Send.” Save is local; explain that sending the saved file yourself is a separate action.

Separate Settings option, off by default: “Automatically send limited crash reports after a crash. Only technical crash codes, app/OS version and approved diagnostic events are sent to the owner through [service]. No memory dumps or meeting content. You can turn this off at any time.” Opt-in per device, versioned notice; revoke clears unsent envelopes immediately, disables further egress, notifies user that already delivered copies may remain. A change in payload/recipient needs fresh consent. Crash delivery must never interrupt recording/recovery. Proposed local startup marker + clean shutdown marker, renderer/worker gone reason and fixed exit codes; distinguish crash, forced exit, hang and unknown termination (not all detectable). On next safe launch, if valid crash consent exists, automatically send bounded metadata from local outbox with duplicate suppression; otherwise offer manual review. No upload during active recording. If process dies before writing a marker, report uncertainty; do not claim full native-stack coverage.

[Electron crash reporter](https://www.electronjs.org/docs/latest/tutorial/crash-reporting) can upload minidumps containing process memory; [Sentry](https://www.sentry.help/en/articles/13964268-what-are-sentry-s-data-scrubbing-options) notes attachments require separate handling. **Never enable native dump upload or session replay**, including on opt-in; server-side scrubbing is too late. Do not introduce raw local dumps by default. OS crash collection remains subject to OS settings; do not alter them. A future separate local-only symbolication experiment must prove safe output and retention before any new approval.

Proposed contract (owner approval rows in `packages/contracts/APPROVALS.md` in implementing PRs): `prepareProblemReport` (category/options → opaque preview ID and exact safe display), `sendProblemReport` / `saveProblemReport` / `discardProblemReport` (preview ID; no arbitrary file paths), `getCrashReportingConsent` / `setCrashReportingConsent` (versioned device-local opt-in), `problemReportStatus` event (ID, state, fixed error code). Freeze snapshot against tampering; main revalidates and checks consent at send; native save picker in main. No secrets/endpoint edits exposed to renderer. Keep context isolation, sandbox, node integration off, trusted sender check, existing one call + one event channel, allowlisted names in preload/main and strict validation/mock parity. Network only in main/backend, fixed destination; no generic fetch/file read IPC. UI follows the design guide; separate backend and UI review.

## 5. Slices and decisions

| Slice | Estimate | Exit |
| --- | ---: | --- |
| P1 | 4–6 h | Invented schema, scrubber, zip/preview equality, negative tests; zero network. |
| P2 | 5–8 h | Approved contracts, Help wizard, local save/email handoff and privacy text, accessible keyboard flow; no automatic send. |
| P3 | 8–12 h | Approved private relay, invite lifecycle, caps, owner receipt, failure/retry tests; verified colleague with no tracker account. |
| P4 | 5–8 h | Separate opt-in crash metadata/outbox, recovery-safe delivery; packaged crash/revoke/egress tests. |
| P5 (optional) | 2–4 h | Owner-reviewed public issue projection and token rotation, only after separate approval. |

Estimates exclude hosting setup and independent reviews. Before delivery: exact-head checks and independent review, explicit owner approval of network/privacy/contract design, real two-platform tests on invented data; obtain approval before any planned test over 20 minutes. Preserve substantive gate evidence under the existing retention policy.

**Open owner decisions:** approve private intake + manual public triage (recommended) vs later relay-created issues; mailbox/provider/region, retention and monthly cap; invitation distribution/revocation; allowed diagnostic flags and no free-text/attachments; crash metadata only, next-launch delivery vs manual-only; and order after M1. No endpoint, contract, UI, policy or code is changed by this plan.
