#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# uat-reset.sh
# UAT environment reset: wipe + reseed UAT test data.
# NEVER run this against production.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

# ── Colour helpers ─────────────────────────────────────────────────────────────
RED='\033[0;31m'; YELLOW='\033[1;33m'; GREEN='\033[0;32m'; NC='\033[0m'

err()  { echo -e "${RED}[ERROR]${NC} $*" >&2; }
warn() { echo -e "${YELLOW}[WARN]${NC}  $*"; }
info() { echo -e "${GREEN}[INFO]${NC}  $*"; }

# ── Production-guard ──────────────────────────────────────────────────────────
#
# Hard-coded list of known production Supabase project refs.
# Add any additional prod refs here — the script refuses to continue if
# SUPABASE_PROJECT_ID matches any entry in this list.
KNOWN_PROD_REFS=(
  "sahvfsoclzgsuewbiiah"
  # add more prod refs here, e.g. "abcdefghijklmnopqrst"
)

if [[ -z "${SUPABASE_PROJECT_ID:-}" ]]; then
  err "SUPABASE_PROJECT_ID is not set."
  err "Export it before running: export SUPABASE_PROJECT_ID=<your-uat-project-ref>"
  exit 1
fi

for prod_ref in "${KNOWN_PROD_REFS[@]}"; do
  if [[ "${SUPABASE_PROJECT_ID}" == "${prod_ref}" ]]; then
    err "============================================================"
    err "  PRODUCTION GUARD TRIGGERED — REFUSING TO CONTINUE"
    err "============================================================"
    err "  SUPABASE_PROJECT_ID=${SUPABASE_PROJECT_ID}"
    err "  This matches the known production project ref: ${prod_ref}"
    err "  This script must NEVER run against production."
    err "  Use a dedicated UAT Supabase project."
    err "============================================================"
    exit 1
  fi
done

warn "Project ref: ${SUPABASE_PROJECT_ID}"
warn "Environment check passed — this does NOT appear to be a known prod project."
echo ""

# ── Require confirmation ───────────────────────────────────────────────────────
if [[ "${SKIP_CONFIRM:-}" != "1" ]]; then
  read -r -p "This will DELETE all rows marked notes='uat_seed' and reseed. Continue? [y/N] " confirm
  if [[ "${confirm}" != "y" && "${confirm}" != "Y" ]]; then
    info "Aborted by user."
    exit 0
  fi
fi

# ── Resolve DB connection ──────────────────────────────────────────────────────
# Prefer an explicit DATABASE_URL; fall back to constructing from project ID.
if [[ -z "${DATABASE_URL:-}" ]]; then
  if [[ -z "${SUPABASE_DB_PASSWORD:-}" ]]; then
    err "Set DATABASE_URL or SUPABASE_DB_PASSWORD so psql can connect."
    exit 1
  fi
  DATABASE_URL="postgresql://postgres:${SUPABASE_DB_PASSWORD}@db.${SUPABASE_PROJECT_ID}.supabase.co:5432/postgres"
fi

SEED_SQL="$(cd "$(dirname "$0")/.." && pwd)/supabase/seed.sql"
if [[ ! -f "${SEED_SQL}" ]]; then
  err "Seed file not found: ${SEED_SQL}"
  exit 1
fi

# ── Resolve psql ───────────────────────────────────────────────────────────────
if ! command -v psql &>/dev/null; then
  err "'psql' not found. Install postgresql-client or set PATH."
  exit 1
fi

PSQL="psql --no-password -v ON_ERROR_STOP=1 \"${DATABASE_URL}\""

# ── Wipe UAT seed rows (cascade-safe order) ────────────────────────────────────
info "Cleaning up existing UAT seed data..."

eval "$PSQL" <<'SQL'
DO $$
DECLARE
  v_deal_ids uuid[];
BEGIN
  -- Collect the UAT deal IDs first
  SELECT array_agg(id) INTO v_deal_ids
  FROM deals WHERE notes = 'uat_seed';

  IF v_deal_ids IS NULL OR array_length(v_deal_ids, 1) = 0 THEN
    RAISE NOTICE 'No UAT seed deals found — nothing to clean up.';
    RETURN;
  END IF;

  RAISE NOTICE 'Removing % UAT deal(s)...', array_length(v_deal_ids, 1);

  -- Remove child rows in dependency order
  DELETE FROM audit_events          WHERE deal_id = ANY(v_deal_ids);
  DELETE FROM tasks                 WHERE deal_id = ANY(v_deal_ids);
  DELETE FROM contracts             WHERE deal_id = ANY(v_deal_ids);
  DELETE FROM quotes                WHERE deal_id = ANY(v_deal_ids);
  DELETE FROM natis_fulfilments     WHERE deal_id = ANY(v_deal_ids);
  DELETE FROM inspections           WHERE deal_id = ANY(v_deal_ids);
  DELETE FROM extraction_results    WHERE deal_id = ANY(v_deal_ids);
  DELETE FROM documents             WHERE deal_id = ANY(v_deal_ids);

  -- Vehicle photos (via vehicle_photo_sets)
  DELETE FROM vehicle_photos
    WHERE photo_set_id IN (
      SELECT id FROM vehicle_photo_sets WHERE deal_id = ANY(v_deal_ids)
    );
  DELETE FROM vehicle_quick_evaluations WHERE deal_id = ANY(v_deal_ids);
  DELETE FROM vehicle_photo_sets    WHERE deal_id = ANY(v_deal_ids);

  -- conversation messages
  DELETE FROM conversation_messages WHERE deal_id = ANY(v_deal_ids);

  -- Deals themselves
  DELETE FROM deals WHERE id = ANY(v_deal_ids);

  -- Buyers / sellers / vehicles referenced only by these deals
  -- (safe to leave orphans — seed will reinsert with fixed UUIDs)
  DELETE FROM buyers   WHERE id_number LIKE '00000000000%';
  DELETE FROM sellers  WHERE id_number LIKE '00000000000%';
  DELETE FROM vehicles WHERE vin LIKE 'UATVIN%';

  RAISE NOTICE 'UAT seed data removed successfully.';
END;
$$;
SQL

info "Cleanup complete."

# ── Reseed ────────────────────────────────────────────────────────────────────
info "Running seed.sql..."
eval "$PSQL" -f "${SEED_SQL}"

info "Done. UAT environment has been reset and reseeded."
info "Run the test suite or open the app to verify the canonical deals."
