### A-354 — 2026-11-13 — Windows PC — malformed non-admin check

- **Status / attribution:** Confirmed agent command error; no system state changed.
- **What failed:** I first called `IsInRole` on `WindowsIdentity` instead of a `WindowsPrincipal`. PowerShell returned: `Method invocation failed because [System.Security.Principal.WindowsIdentity] does not contain a method named 'IsInRole'.`
- **Impact:** The first administrative-role check did not produce a result.
- **Correction / remaining risk:** Re-ran using `WindowsPrincipal.IsInRole`; result was `False` (not administrator). Low.
