# UAT Defect Tracker — vehiclefinance

**Version:** 1.0  
**Date:** 2026-04-17  
**Phase:** 6 — UAT Preparation

---

## 1. GitHub Issues Template

When raising a defect discovered during UAT, create a GitHub Issue using the template below. Apply label `uat-defect` and the appropriate severity label (`P0`, `P1`, `P2`, or `P3`).

```markdown
---
name: UAT Defect
about: Defect discovered during UAT Track B
title: "[UAT-DEFECT] <short description>"
labels: uat-defect, P?
assignees: ''
---

## Defect Reference
- **UAT Scenario:** UAT-XXX
- **Severity:** P0 / P1 / P2 / P3
- **Reported by:** [Tester name]
- **Date found:** YYYY-MM-DD
- **Environment:** UAT (project ref: _redacted_)

## Summary
<!-- One-sentence description of what went wrong -->

## Steps to Reproduce
1. 
2. 
3. 

## Expected Behaviour
<!-- What should have happened -->

## Actual Behaviour
<!-- What actually happened — include error messages, screenshots, or logs -->

## Seed State
<!-- Which canonical deal was involved? Was the environment freshly reset? -->
- Deal number: UAT-2026-00X
- Reset run before session: Yes / No

## Evidence
<!-- Attach screenshots, browser console output, or Supabase log snippets -->

## Suggested Fix (optional)
<!-- If the tester has a hypothesis about root cause -->
```

---

## 2. Defect Triage Process

### Step 1 — Tester logs defect
1. Run `uat-reset.sh` to confirm the bug is reproducible on a clean environment.
2. Create GitHub Issue using the template above.
3. Post in Slack `#uat-track-b` with a link to the issue and severity.

### Step 2 — Triage (within SLA)
| Severity | Triage SLA | Who |
|----------|-----------|-----|
| P0 | Immediately (< 1 hour) | Engineering Lead + UAT Lead |
| P1 | Same business day | Engineering Lead |
| P2 | Next standup | Engineering Lead or senior dev |
| P3 | Weekly backlog review | Product Owner |

### Step 3 — Engineering assessment
- Engineering confirms reproducibility.
- Assigns to appropriate developer.
- Adds `fix-in-progress` label.
- Links related code files or migrations in the issue.

### Step 4 — Fix & verify
- Developer opens a PR referencing the issue: `Fixes #XXX`.
- PR must include:
  - The fix (no scope creep).
  - A note on how to verify in the UAT environment.
- PR merged; engineering deploys fix to UAT.
- Tester re-runs the affected scenario from a fresh `uat-reset.sh`.
- Tester closes the issue with a `verified` label and date.

### Step 5 — Re-test gate
- P0: UAT cannot resume until the fix is verified.
- P1: Affected scenario blocked; other scenarios may continue.
- P2/P3: Testing continues in parallel with fix.

---

## 3. Defect Log

| Issue # | Scenario | Severity | Title | Status | Assignee | Verified |
|---------|----------|----------|-------|--------|----------|---------|
| — | — | — | _No defects logged yet_ | — | — | — |

> Update this table daily during UAT. Use GitHub Issue numbers.

---

## 4. Known Limitations (Pre-UAT)

The following items are known before UAT starts and are NOT to be raised as new defects:

| ID | Description | Decision |
|----|-------------|----------|
| KL-001 | `deals.notes` column added by seed.sql (not in Phase 2 migrations) | Acceptable for UAT; migration PR to be raised post-UAT |
| KL-002 | Vehicle photo URLs use `storage.example` placeholder domain | Seed data only; real uploads use Supabase Storage in UAT |
| KL-003 | `assigned_fni_agent_id` / `assigned_ops_agent_id` are NULL in all seed deals | Assign manually during UAT-008 if agent assignment UI is in scope |
