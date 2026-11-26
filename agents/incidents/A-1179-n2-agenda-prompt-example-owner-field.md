### A-1179 — 2026-11-25 — Claude — Inherited agenda prompt example invited an owner on every fact

- **Agent:** Claude (Sonnet 5.5, Regiurn Windows local session); the prompt came from N1 and I ran it unchanged first.
- **What failed:** The N1 agenda prompt's example output included an `owner` field, so the 7B model filled it with each speaker and verification rejected every fact (16/16 flagged). I did not check the prompt example before the first model run.
- **Impact:** One wasted comparison run (about 41 s) and a prompt change; run 1 is reported as a pre-change result, run 2 on fresh seeds.
- **Correction / remaining risk:** Example removed owner; prompt hash recorded. Low.
