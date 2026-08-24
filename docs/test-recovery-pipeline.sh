#!/usr/bin/env bash
# Smoke-test the recovery pipeline end-to-end:
#   ingest a decline  →  price (A) / trace (B)  →  read it back
#
# The intake shared secret is NOT committed. Provide it via env:
#   DECLINE_INTAKE_KEY=<key> ./docs/test-recovery-pipeline.sh
#
set -euo pipefail

SUP_URL="https://sahvfsoclzgsuewbiiah.supabase.co"
KEY="${DECLINE_INTAKE_KEY:?Set DECLINE_INTAKE_KEY env var (the intake shared secret)}"

hdr=(-H "content-type: application/json" -H "x-intake-key: $KEY")

echo "── 1. Ingest two declines (one affordability, one non-contactable) ──────────"
curl -sS -X POST "$SUP_URL/functions/v1/decline-intake" "${hdr[@]}" -d '{"records":[
  {"absa_ref":"SMOKE-A-'"$(date +%s)"'","decline_reason":"Declined: affordability","applicant":{"full_name":"Test Upsell","id_number":"9001015800081","phone":"27821110001"},"vehicle":{"make":"Ford","model":"Fiesta","year":2019,"price":260000,"deposit":20000},"financials":{"monthly_income":30000,"disposable_income":5200}},
  {"absa_ref":"SMOKE-B-'"$(date +%s)"'","decline_reason":"Unable to contact - number invalid","applicant":{"full_name":"Test Reactivate","id_number":"8804125800080","phone":"27829990002"},"vehicle":{"make":"Kia","model":"Picanto","year":2021,"price":210000}}
]}' | python3 -m json.tool

echo "── 2a. Price the affordability declines (Workstream A) ──────────────────────"
curl -sS -X POST "$SUP_URL/functions/v1/recovery-process" "${hdr[@]}" -d '{"limit":50}' | python3 -m json.tool

echo "── 2b. Trace the non-contactable declines (Workstream B) ────────────────────"
curl -sS -X POST "$SUP_URL/functions/v1/recovery-trace" "${hdr[@]}" -d '{"limit":50}' | python3 -m json.tool

echo
echo "✓ Done. Open the dashboard → Recovery to see the leads + click into detail:"
echo "  https://orange-bay-0066a4b03.7.azurestaticapps.net"
