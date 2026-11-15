# Gate 6 judged-precision receipt (numbers only, 2026-11-14)

Produced by `node dist/eval/gate6.js <fixtures> <out> IS1004d ES2015c TS3005b --judge --json judge.json` on the extractions of the original Gate 6 run (same files, no re-extraction). Code at commit 3bfb9a66 plus this PR (no scorer change). Mac desktop, llama-server `-c 24576 -ngl 99 -t 4 -fa on -ctk q8_0 -ctv q8_0 -np 1`, Qwen3.5-9B-Q4_K_M.gguf (sha256 starts 03b74727a860a563), judge `maxTokens` 30, schema verdict genuine or not_an_item. Wall time about 24 minutes including a pause (A-399).

| Meeting | Items judged | Genuine | Not genuine | sha256 of saved extraction (kept locally, not in git) |
| --- | ---: | ---: | ---: | --- |
| IS1004d | 51 | 16 | 35 | 13c6bcc6d59b50be7d7b6992b7ff7b98715c9175ab8eb0c37fe14bb8f105397f |
| ES2015c | 58 | 16 | 42 | faf0548310d11886b1d224531e70b8d5423539aa86728707c89c383798372c3f |
| TS3005b | 62 | 22 | 40 | 6fe4de71bd90faab53dcee468ccdafb14f171a2f42594f2b8f209e0430621d85 |
| Pooled | 171 | 54 | 117 | |

Judge output `judge.json` sha256 3212d5ede64e3dc92c428179e185092cda0eac042542988ff7880055dfa002e3 (kept locally; it holds counts and link problem lists, no per-item verdicts). Rerunning the judge on the same extractions would reproduce counts only approximately if sampling is not deterministic; that was not checked.
