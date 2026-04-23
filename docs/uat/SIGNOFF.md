# UAT Sign-Off — vehiclefinance

**Version:** 1.0  
**Date:** 2026-04-17  
**Project:** vehiclefinance UAT Track B  
**UAT Lead:** [TO BE ASSIGNED]

---

## 1. Entry Criteria

The following conditions must be met before UAT commences:

| # | Criterion | Owner | Status |
|---|-----------|-------|--------|
| 1 | UAT Supabase project provisioned (not the production project) | DevOps | [ ] |
| 2 | `uat-reset.sh` executed successfully; 5 canonical deals seeded | DevOps | [ ] |
| 3 | Web app deployed to UAT URL | DevOps | [ ] |
| 4 | WhatsApp bot connected to UAT Dialog360 channel | DevOps | [ ] |
| 5 | All P0 and P1 defects from prior phases resolved | Engineering | [ ] |
| 6 | Test participants briefed and accounts provisioned | UAT Lead | [ ] |
| 7 | `docs/uat/TEST_SCRIPTS.md` distributed to all participants | UAT Lead | [ ] |

UAT may not begin until all entry criteria are checked.

---

## 2. Exit Criteria

UAT is complete and sign-off may be granted when ALL of the following are true:

| # | Criterion |
|---|-----------|
| 1 | All 12 test scenarios (UAT-001 to UAT-012) executed at least once |
| 2 | UAT-012 (RLS boundary) passes — zero data exposed to anon users |
| 3 | Zero open P0 defects |
| 4 | Zero open P1 defects |
| 5 | All P2 defects have an accepted resolution plan (fix or known limitation) |
| 6 | P3 defects logged; deferred to post-launch backlog is acceptable |
| 7 | Sign-off table below signed by all required signatories |

---

## 3. Severity Scale

| Priority | Name | Definition | SLA to Resolve |
|----------|------|------------|----------------|
| **P0** | Blocker | Security defect or data loss. Blocks all further testing and deployment. Examples: anon user can read deal PII; data deleted without audit trail. | Must be fixed before UAT resumes. No exceptions. |
| **P1** | Critical | Core happy-path flow broken. A canonical UAT deal cannot progress through the pipeline. Examples: doc upload returns 500; quote not displayed to buyer. | Fix within 24 hours of logging. UAT may continue on other scenarios. |
| **P2** | Major | Feature degraded but workaround exists. Examples: SLA indicator colour wrong; audit log missing one event type. | Fix within 3 business days. |
| **P3** | Minor | Cosmetic or low-impact. Examples: typo in bot message; table column misaligned on mobile. | Log and defer to post-launch backlog. |

---

## 4. Daily Triage Cadence

| Time | Activity |
|------|----------|
| 09:00 | UAT standup (15 min): review overnight defects, reprioritise day's testing |
| 12:00 | Mid-day defect sweep: DevOps + Engineering review new P0/P1 |
| 17:00 | End-of-day defect log update; tester notes added to DEFECTS.md |
| Async | Slack channel `#uat-track-b` for real-time blockers |

---

## 5. Sign-Off Table

| Role | Name | Signature | Date |
|------|------|-----------|------|
| Product Owner | [PLACEHOLDER] | __________ | _____ |
| Engineering Lead | [PLACEHOLDER] | __________ | _____ |
| UAT Lead | [PLACEHOLDER] | __________ | _____ |
| Compliance / POPIA | [PLACEHOLDER] | __________ | _____ |
| F&I Representative | [PLACEHOLDER] | __________ | _____ |
| Ops Representative | [PLACEHOLDER] | __________ | _____ |

Signed sign-off table confirms the product is fit for production release under the scope tested.

---

## 6. Out-of-Scope Items

The following are explicitly out of scope for this UAT:

- Performance / load testing.
- Third-party payment gateway integration (not yet built).
- Regression testing of Phase 1–5 infrastructure changes.
- Browser compatibility beyond Chrome (latest) and Safari (latest).
