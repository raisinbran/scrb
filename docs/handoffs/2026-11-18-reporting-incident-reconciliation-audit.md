# Incident reconciliation and non-Claude reporting audit — 2026-11-18 PT

**Tracking:** [#358](https://github.com/raisinbran/scrb/issues/358), **OPEN**.  
**Reference repository:** `main` `75151f41aeb73f52d47e6890f1823a0f980cd6f9` (includes #359 and A-771).  
**Evidence boundary:** GitHub branch snapshots/issue comments, plus explicitly attributed previous task-session reports of unpublished Mac/Regiurn evidence. No local desktop files, private recordings, account meters, or per-turn session logs were read by this auditor. A public omission does not prove a local record never existed. No old record was erased.

## A. Incident identity reconciliation

| Provenance / task | Old or provisional ID | Canonical / proposed ID | Actual evidence and disposition |
| --- | --- | --- | --- |
| M1/V1 reporting coordination, merged #359 | A-771 | **A-771** | Published on `main`; unique in the inspected published branches. Issue #358 remains open. |
| Mac M1 Phase A isolation/preflight | A-722 | **A-722 (provisional)** | No published collision seen. Local file and usage row reported, **not reviewed or published** here. The local record must be inspected before publication. |
| Mac earlier isolation/device checks | A-774, A-775 | **A-774, A-775 (provisional)** | Both were previously disclosed as local/unpublished; PR #362's temporary A-774 has been removed. Check physical files and further reservations before publication. |
| Mac M1 Phase B process probe | A-778 | **A-778 (provisional)** | Ambiguous Electron/process identity evidence; task technically **INCONCLUSIVE**; local report unpublished and not inspected. |
| Mac M1 Phase B missing start time | A-779 | **A-779 (provisional; must be retained)** | Documented reporting deficiency. **Do not remove or reclassify** because its exact PT start cannot be recovered. Original local incident must be published or linked through reviewed PR. |
| Regiurn authorized prior-recording search | A-723 | **A-723 (provisional)** | Overbroad temp-directory search; publicly disclosed, local report not inspected; no collision in inspected published register. |
| Regiurn shell-history result | A-724 | **A-781 (proposed)** | A-724 is ALREADY published for an unrelated malformed Vitest-source search. Local file must be copied/renamed in its source worktree; no rename performed here. **HOLD publication.** |
| Regiurn path lookups | A-725 | **A-782 (proposed)** | A-725 is ALREADY published for unrelated Vitest write permissions. Local file unavailable; **HOLD publication** pending actual edit. |
| Regiurn tool-catalog search | A-726 | **A-783 (proposed)** | A-726 is ALREADY published for unrelated formatting scope. Local file unavailable; **HOLD publication** pending actual edit. |
| About model inventory, PR #361 | A-772, A-773 | **A-772, A-773** | First-published reservations on this draft branch; distinct formatting/typecheck incidents. No published collision after #362 correction. |
| About model inventory connector metadata error, PR #361 | previously unnumbered | **A-784** | Separate documented GitHub request-schema failure, committed to PR #361 with corrected task usage row. |
| Offline User Manual, PR #362 | A-772, then A-774 | **A-780** | Both earlier IDs conflicted (PR #361 and unpublished Mac A-774 respectively). Incident evidence retained in PR history; canonical new filename/header, usage reference, and PR body corrected. |

**Verified published-branch heads when audited:** PR #361 `9c67ce27ae414e3af7639ba773033c9ff8fe67f7`; PR #362 `30b611f06adb78d0ec8b40e08874088984edecc2`. A-780 and A-784 exist only on their respective **draft/unmerged** PR branches. The proposed A-781–A-783 mappings are **not** completed modifications or confirmed available reservations on the Regiurn machine.

**Other disclosed local conflicts still requiring an on-device inventory:** Regiurn's older A-712/A-713/A-714 notes overlap already published A-712/A-713 and a separately reported Windows A-714 reservation; another Windows machine reported A-714–A-718 with A-715 overlapping the published register. Reconcile *original file contents*, task ownership and local rows before assigning replacements; do not infer that two similar error titles are the same incident. Mac A-774/A-775 are likewise provisional. Unpublished records can still collide with these mappings. All unresolved records are **PUBLICATION HOLD**, not silently declared unique.

**Reconciliation protocol for local records:** preserve original content and immutable local backup/history; compare `main`, all open PRs, and known local reservations; rename only affected incident filename and header, and update *all* linked usage/handoff/PR references within a reviewed branch. Record the old provisional ID in a correction note. Rerun the exact-head register/usage checks and obtain independent review before merge. Never push directly to `main`.

## B. Mac Phase B outcome and accounting

**Technical: INCONCLUSIVE. Administrative: REPORTING NONCOMPLIANT.** The prior session reported an ambiguous Electron/process-selection probe (A-778); there was no basis for an accepted Phase B capture. It also reported A-779 because the exact PT start time was not captured. Preserve that deficiency even if subsequent source inspection cannot reconstruct an exact timestamp.

**Reported, not independently verified from local files:** model GPT-6; effort/variant **unavailable** (not exposed in the previous chat session); end **10:03:21 PT**; five-hour allowance **99% → 98% remaining**, weekly **65% → 65% remaining**. An exact start time was **not recorded**, so do not invent one or label this an exact elapsed-time measurement. Any reset or concurrent usage is unknown unless documented in the original local record. These readings are shared/account-level observations, not proven isolated task cost.

The Mac usage row and A-778/A-779 files were described as **local/untracked/unpublished** in the prior session. Their actual bytes, retained path and publication readiness were not inspected. To remedy the status, publish the original records through an independently reviewed PR, explicitly stating the missing-start-time reason, then audit that handoff again. This report **does not substitute** for A-779 or certify Mac Phase B.

## C. Two independent non-Claude handoff audits — content, not file existence

| Handoff audited | What the owner actually received / source checked | Reporting verdict |
| --- | --- | --- |
| Cloud task PR [#361](https://github.com/raisinbran/scrb/pull/361), About inventory | The owner-facing closeout gave model GPT-6, approximate 10:04–10:28 PT, unavailable effort/quota and committed row. But the original 12-column row stopped at the **10:18 CI-remediation checkpoint**, not the handoff; the initial row did not explain effort-source limitations precisely and omitted the later rejected metadata action. CI technical status was reported separately. **Correction:** same task row revised with time precision, source-specific unavailability, incident A-784, and explicit branch-only status; previous row remains in Git history. | **Original handoff REPORTING NONCOMPLIANT. Corrective row ON PR #361, not yet on `main`.** |
| Cloud task PR [#362](https://github.com/raisinbran/scrb/pull/362), offline Help manual | The submitted initial 12-column row recorded **~10:03–10:12:35 PT** only. The actual PR description separately reported continuing authoring through **10:26:02 PT**, two CI failures and no local tests. Original row did not reflect that continuation or reliably identify source for inaccessible readings. Its A-772 then A-774 ID collided. **Correction:** incident A-780, revised single row with documented continuation, unknown exact terminal end, reasons for unavailable meters/effort, and branch-only status. | **Original handoff REPORTING NONCOMPLIANT. Corrective row ON PR #362, not yet on `main`.** |

**Additional samples:** PR [#360](https://github.com/raisinbran/scrb/pull/360) explicitly says its task accounting is in a session handoff, not the narrow three-file PR, and the inspected branch has **no** `2026-11-18*` usage-row file. The private handoff may exist, so this is **published-row MISSING / reporting not independently verifiable**, not proof that no local row was written. The Mac Phase B handoff is also **REPORTING NONCOMPLIANT**, with the missing-start-time incident and unpublished task accounting above.

**Closure assessment:** Two distinct non-Claude cloud handoffs were evaluated against actual timestamps, field explanations, continuation evidence, incident provenance and publication state, **not merely row existence**. Neither *original* handoff satisfies the complete closeout rule. The Mac desktop Phase B source reports a further violation; its local files could not be independently checked. Thus the requested *two successive fully compliant handoffs*, including a desktop executor where available, are **NOT ESTABLISHED**. Keep #358 **OPEN**.

## D. Next actions / gates

1. **Mac owner/executor:** preserve A-722, A-774/A-775 and A-778/A-779 locally; publish accurate 12-column rows and the true incident texts by reviewed PR. A-779 must record exact-start unavailability; do not repair it with a guessed time. Do not change Phase B technical status.
2. **Regiurn executor:** in the correct local worktree, inspect A-723–A-726 and their related row; retain A-723 if still unique and reconcile the other three to the proposed A-781–A-783 only after confirming all current reservations. Older A-712–A-714 and Windows A-714–A-718 remain separate collision work. No app inference or repository write workaround is requested.
3. **PRs #361/#362:** require exact-head Windows/macOS CI and independent formal review of the corrected reporting as well as each PR's feature. No author self-review, no owner-independent merge.
4. **Next audit gate:** sample at least two further genuinely **complete** non-Claude handoffs, including a desktop executor and a cloud task if available. Verify real footer, exact or honestly unavailable PT data, model/effort evidence source, 5h/week readings or source-specific unavailability, resets/overlap, retries, incidents, and a 12-column usage row's branch/PR/main disposition. Only then consider issue #358 closure under owner authority.

**Changes in this audit:** documents/usage/incident metadata only; no audio, recording, models, platform tests, security settings, production code or private machine files accessed. No merge or issue closure authorized.
