### A-595 — Incident identifier chosen before checking the concurrent PR allocation

- **Status / attribution:** Confirmed agent workflow error; no application effect.
- **What failed:** I initially chose A-580 through A-584 from the local checkout without noticing those identifiers were already reserved by open PR #330. The thread memory documented A-580 through A-589 as reserved. I then renumbered this task's incidents A-590 through A-594 after checking the concurrent allocation.
- **Agent-controlled cause:** I relied on the local main checkout before reconciling all open PR reservations.
- **Impact:** No identifier was published or merged. One register check first reported local duplicate IDs while my incident entries temporarily appeared in both the legacy register and individual files; I removed the duplicate legacy block and the register check passed before renumbering.
- **Evidence:** Open PR #330 allocation; current `agents/incidents/` files and `npm run check:register`.
- **Correction / prevention:** Check open PR reservations before choosing incident IDs and keep each new incident in a single incident file.
