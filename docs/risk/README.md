# Risk Register

Living risk documentation for the Claimtec FinOps platform.

| Doc | Scope | Last reviewed |
|---|---|---|
| [SECURITY.md](./SECURITY.md) | Auth/authz, RLS, secrets, dependencies, OWASP-style audit | 2026-05-25 |
| [DATA_INTEGRITY.md](./DATA_INTEGRITY.md) | Schema drift, cascade deletes, race conditions, irreversible ops | 2026-05-25 |
| [DEMO_PROD_REGISTER.md](./DEMO_PROD_REGISTER.md) | Live demo failure modes, recovery playbook, pre-demo checklist | 2026-05-25 |
| [DEPENDENCY_COSTS.md](./DEPENDENCY_COSTS.md) | All external services: cost, limits, exhaustion behaviour, escape hatches | 2026-05-25 |

## How to use this

- **Before a demo:** Re-read `DEMO_PROD_REGISTER.md` § Pre-demo checklist.
- **After an incident:** Add an `INCIDENT-N` entry to `DEMO_PROD_REGISTER.md`.
- **Before deploying:** Walk `DATA_INTEGRITY.md` § Mid-deploy hazards.
- **Quarterly:** Refresh `SECURITY.md` (rotate secrets, re-audit RLS).
- **Annually:** Full cost review of `DEPENDENCY_COSTS.md` — tier, usage, spend.

## Summary counts (2026-05-25)

| Doc | Critical | High | Medium | Low |
|---|---|---|---|---|
| Security | 0 | 5 | 12 | 11 |
| Data Integrity | — | 6 | 11 | 2 |
| Demo/Prod | 5 (P0) | 5 (P1) | 5 (P2) | — |
| Dependency/Cost | — | — | (see SPOF table) | — |

**Top 5 things to do this week:**
1. Verify Supabase tier — upgrade to Pro if Free (single biggest risk reducer)
2. Fix CI so auto-deploy resumes
3. Set Mindee renewal calendar reminder
4. Confirm storage bucket policies (SECURITY S-2.3)
5. Add CSP header to Azure SWA (SECURITY S-5.2)
