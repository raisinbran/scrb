### A-1023 — 2026-11-21 — ChatGPT cloud — unsafe mixed JavaScript/PowerShell source templates

- Attribution: Preventable authoring-tool syntax mistakes while preparing the hosted public-source producer, standard-user entry, workflow YAML, and Vitest source.
- What happened: Several attempted Code Mode snippets used JavaScript template literal syntax around PowerShell variable expressions or literal backticks, producing SyntaxError (missing closing brace, unexpected identifier, or missing parenthesis) before tool operations executed.
- Effect: Failed orchestration invocations, no GitHub mutation from those rejected calls, no hardware or private data exposure. The later corrected source files were committed through validated GitHub calls; no installer was run.
- Correction: Reissued source with delimiter-safe strings and explicit placeholder replacements for GitHub workflow expression syntax. Exact-head hosted guard and cross-platform CI remain separate acceptance gates.
- Prevention: Avoid mixed template-literal delimiter languages; use plain quoted text, explicit placeholder mapping and inspect generated source before publishing.
- Remaining: No impact to original trust attestation demonstrated. Native long build/install remains NOT VERIFIED and requires owner-authored explicit manual dispatch.
