# Handoff for the period after Claude access ends (written 2026-11-14)

**Why:** Claude access ends about 28 hours after this note. Codex and ChatGPT continue. This is a planner's summary, not a verified status: check anything marked "verify" before acting. Independent review pending.

## How work is done here (all in AGENTS.md; the short version)
- Owner is non-technical and merges every PR. Give exact click steps: open PR, Ready for review if draft, arrow next to the green button, Squash and merge, Confirm, delete any Co-Authored-By line, do not click Delete branch.
- No attribution lines in commits or PR text; never name an agent in PR text ("independent review"). Branch prefix `cuc/`. No force-push. Agents never merge.
- Every PR needs independent review before merge: author and reviewer must differ. ChatGPT Chat reviews; follow `agents/reviewer-assessment-chatgpt-2026-11-14.md` (list the whole defect family in round 1, rank by real-world likelihood, stop after two reject rounds on a heuristic).
- Contract changes (`packages/contracts/`) need owner approval. UI code only in `apps/desktop/src/ui/`; colors only in `theme/tokens.css`; never weaken Electron security settings.
- Usage: read allowance at start and end of every task; add one new file in `agents/usage-log/` (12 columns; column 8 = percentage-point decrease computed from columns 6 and 7). Incidents: new files in `agents/incidents/`, next unused A-number (check open PRs).
- No test over 20 minutes without owner approval. Real meeting recordings are confidential: never read, commit or share.
- Every prompt for the owner to paste starts "PASTE INTO: <agent>, <PC / folder>, admin yes/no". Windows PCs: Regiurn (Windows 11, repo `C:\Users\brand\Documents\scrb-check\scrb`) and BCHEN-W10 (Windows 10, random-shutoff problem, repo `C:\Users\bchen\Documents\GitHub\scrb`). Node 22 per process only.

## Running now (verify at 09:30 PST on 2026-11-14)
- Gate 8 8-hour recorder-only runs: Regiurn started 01:23:50 PST, BCHEN-W10 started 01:39:58 PST; each finishes about 8 hours later. Evidence under `%LOCALAPPDATA%\scrb-long-run\<timestamp>\` (outside git; keep raw logs). After finishing, run `node scripts\long-run\overnight.mjs --report <copy of folder>` on a COPY. The verifier was patched in PR #222 (counts gaps only at or above the helper's 2 ms tolerance) and is not independently reviewed; the final Gate 8 assessment is not independently verified until #222 is reviewed. A discontinuity near 17 s (Regiurn, 7.7 ms) and 25 s (W10, 190 ms, marked) was logged; the report decides whether they count.

## Open PRs and what each needs (verify with `gh pr list`)
- #221 Gate 6 reconcile rule: in the last independent-review round; merge when approved. Gate 6 results (74% tuning, 68% held-out, target 80%) are unmet; the target/model decision is the owner's.
- #210 transcript editing, #222 Gate 8 fixes, #223 this note and the reviewer assessment, #224 and #225 search tests and highlight, #226 accessibility audit, #213 auto titles: each needs independent review, then owner merge.
- Old v1/Rust drafts (#87 to #95, #131 to #138 and others) and Dependabot PRs: owner decides what to close. Do not merge them without review.

## Owner decisions still open
Gate 6 target or model; final app icon design (current icon is a placeholder; do not pick it for the owner); whether to remove the inspector panel (no defined purpose; queue after UI polish); approval of `docs/plans/overlap-chronological-order.md` (draft; fixes overlapped speech showing out of order); typed-notes fill plan (#131, post-M1); later start window for Gate 8 reruns.

## Known unverified or not done
Windows steps 9 and 10 (2-minute recording test) are a hands-on owner test; M1 is not accepted end to end. Speaker-merge cause in the owner's meetings is unconfirmed until a real meeting's `final-pass-speakers` log line is read. Windows whisper builds CPU-only (RTX 3080 CUDA build not done). BUG-1 Zoom and browser targets untested.

## Owner decisions made 2026-11-14 (after the section above was written)
- **Deleting a whole meeting (security review SP-02):** the app must ASK whether to also remove what it learned from that meeting (voice profiles, vocabulary); default answer is keep. Not built yet; needs a delete-dialog change (UI) and a backend path; check whether the contract needs a field and get owner approval if so.
- **Overlapped speech order:** paragraphs may run up to about one minute; interjections break a paragraph only where they genuinely happened; the app needs an in-app option to re-process an existing recording (especially after a model update). The plan `docs/plans/overlap-chronological-order.md` is being revised to this; implement only from the revised, owner-approved version.
- **Inspector panel:** removed (PR #228).
- **Typed outline feature:** wanted if effort allows; plan in PR #229 (`docs/plans/outline-organised-transcript.md`), needs owner approval and a contract change approval before any code.
- **Fable model:** not wanted unless something fails without it.
