# UAT Participants — vehiclefinance

**Version:** 1.0  
**Date:** 2026-04-17  
**Phase:** 6 — UAT Preparation

Replace every `[PLACEHOLDER]` below with real values before UAT commences.

---

## 1. UAT Core Team

| Role | Name | Email | WhatsApp / Phone | Availability |
|------|------|-------|------------------|--------------|
| UAT Lead | [PLACEHOLDER] | [PLACEHOLDER]@[company].com | [PLACEHOLDER] | [PLACEHOLDER] |
| Engineering Lead | [PLACEHOLDER] | [PLACEHOLDER]@[company].com | [PLACEHOLDER] | [PLACEHOLDER] |
| DevOps | [PLACEHOLDER] | [PLACEHOLDER]@[company].com | [PLACEHOLDER] | [PLACEHOLDER] |
| Product Owner | [PLACEHOLDER] | [PLACEHOLDER]@[company].com | [PLACEHOLDER] | [PLACEHOLDER] |

---

## 2. Testers by Persona

### Buyer Persona Testers

| Tester Name | Test WhatsApp Number | Assigned Deal(s) | Scenarios |
|-------------|----------------------|-----------------|-----------|
| [PLACEHOLDER] | +27000000001 (UAT handset A) | UAT-2026-001 | UAT-001 |
| [PLACEHOLDER] | +27000000002 (UAT handset B) | UAT-2026-002 | UAT-002, UAT-003 |
| [PLACEHOLDER] | +27000000004 (UAT handset D) | UAT-2026-004 | UAT-006, UAT-007 |

> Note: Do NOT use real personal WhatsApp numbers for testing. Provision dedicated UAT SIM cards or use the Dialog360 test mode.

### Seller Persona Testers

| Tester Name | Test WhatsApp Number | Assigned Deal(s) | Scenarios |
|-------------|----------------------|-----------------|-----------|
| [PLACEHOLDER] | +27000000013 (UAT handset C) | UAT-2026-003 | UAT-004, UAT-005 |

### Ops Agent Testers

| Tester Name | Web App Email | UAT Account Created | Scenarios |
|-------------|--------------|---------------------|-----------|
| [PLACEHOLDER] | ops.tester1@uat.example | [ ] | UAT-008, UAT-010, UAT-011 |

### F&I Agent Testers

| Tester Name | Web App Email | UAT Account Created | Scenarios |
|-------------|--------------|---------------------|-----------|
| [PLACEHOLDER] | fni.tester1@uat.example | [ ] | UAT-009 |

### Security / Compliance Tester

| Tester Name | Role | Scenarios |
|-------------|------|-----------|
| [PLACEHOLDER] | Compliance / POPIA | UAT-012 |

---

## 3. UAT Environment Access

| Resource | Value |
|----------|-------|
| Web App UAT URL | `https://[PLACEHOLDER].vercel.app` (or custom domain) |
| Supabase UAT Project Dashboard | `https://supabase.com/dashboard/project/[PLACEHOLDER]` |
| Dialog360 UAT Channel | `[PLACEHOLDER]` |
| Slack UAT Channel | `#uat-track-b` |
| GitHub Issues (defects) | `[PLACEHOLDER repo URL]/issues` |

---

## 4. Credentials Management

- UAT account passwords are stored in [PLACEHOLDER — e.g. 1Password UAT vault].
- Service keys and project refs must NOT be shared in Slack or email.
- All participants must use the UAT Supabase project ref only. The production ref `sahvfsoclzgsuewbiiah` is blocked at the script level.
- Rotate UAT credentials after UAT concludes.

---

## 5. Communication Plan

| Channel | Purpose |
|---------|---------|
| `#uat-track-b` Slack | Real-time issues, blockers, daily standup notes |
| GitHub Issues | Formal defect tracking |
| Email | Formal sign-off communications |
| Daily standup | 09:00 — see `SIGNOFF.md` for cadence |
