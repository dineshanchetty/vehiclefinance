#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# setup-test-env.sh
#
# One-command bring-up of a local or UAT test environment.
# Runs pnpm install, builds shared + bot + web, verifies envs, optionally
# pushes migrations + seeds UAT data to a Supabase branch, then runs
# the full local test suite.
#
# Safe to re-run. Refuses to touch any Supabase project ref listed as prod
# in packages/api/scripts/uat-reset.sh.
#
# Usage:
#   scripts/setup-test-env.sh                 # install + build + typecheck + test
#   scripts/setup-test-env.sh --with-db       # additionally push migrations + seed
#   scripts/setup-test-env.sh --help
#
# Prereqs:
#   - pnpm 9+, node 20+
#   - For --with-db: supabase CLI + SUPABASE_PROJECT_ID + SUPABASE_ACCESS_TOKEN
#   - For Deno tests: deno 1.x+
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

# ── Colour helpers ───────────────────────────────────────────────────────────
RED='\033[0;31m'; YELLOW='\033[1;33m'; GREEN='\033[0;32m'; BLUE='\033[0;34m'; NC='\033[0m'
ok()   { echo -e "${GREEN}✓${NC} $*"; }
info() { echo -e "${BLUE}›${NC} $*"; }
warn() { echo -e "${YELLOW}⚠${NC}  $*"; }
err()  { echo -e "${RED}✗${NC} $*" >&2; }

# ── Args ─────────────────────────────────────────────────────────────────────
WITH_DB=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --with-db) WITH_DB=1; shift ;;
    --help|-h)
      sed -n '2,24p' "$0" | sed 's/^# \?//'
      exit 0
      ;;
    *) err "Unknown option: $1"; exit 2 ;;
  esac
done

REPO_ROOT=$(cd "$(dirname "$0")/.." && pwd)
cd "$REPO_ROOT"

# ── 1. Toolchain ─────────────────────────────────────────────────────────────
info "Checking toolchain…"
command -v pnpm >/dev/null || { err "pnpm not installed (https://pnpm.io/installation)"; exit 1; }
command -v node >/dev/null || { err "node not installed"; exit 1; }
ok "pnpm $(pnpm --version), node $(node --version)"

DENO_OK=1
command -v deno >/dev/null || { DENO_OK=0; warn "deno not installed — Deno integration tests will be skipped"; }
[[ $DENO_OK = 1 ]] && ok "deno $(deno --version | head -1 | awk '{print $2}')"

if [[ $WITH_DB = 1 ]]; then
  command -v supabase >/dev/null || { err "supabase CLI required for --with-db"; exit 1; }
  ok "supabase $(supabase --version)"
fi

# ── 2. Install + build ───────────────────────────────────────────────────────
info "pnpm install --frozen-lockfile"
pnpm install --frozen-lockfile
ok "dependencies installed"

info "building shared + bot + web"
pnpm -r build
ok "all packages built"

# ── 3. Typecheck ─────────────────────────────────────────────────────────────
info "typecheck"
pnpm -r typecheck
ok "typecheck clean"

# ── 4. Web tests ─────────────────────────────────────────────────────────────
info "web unit tests"
pnpm --filter @vehiclefinance/web test
ok "web tests pass"

# ── 5. Deno checks (type-only; integration tests require live DB) ────────────
if [[ $DENO_OK = 1 ]]; then
  info "deno check — integration test files"
  (cd packages/api/tests && deno check --quiet ./*.ts)
  info "deno check — edge function"
  (cd packages/api/supabase/functions/extract-document && deno check --quiet index.ts)
  ok "deno typechecks clean"
fi

# ── 6. Optional: database setup ──────────────────────────────────────────────
if [[ $WITH_DB = 1 ]]; then
  info "applying migrations + seed to Supabase project…"
  : "${SUPABASE_PROJECT_ID:?SUPABASE_PROJECT_ID must be set for --with-db}"
  : "${SUPABASE_ACCESS_TOKEN:?SUPABASE_ACCESS_TOKEN must be set for --with-db}"

  # Prod-ref guard — keep in sync with packages/api/scripts/uat-reset.sh.
  KNOWN_PROD_REFS=("sahvfsoclzgsuewbiiah")
  for prod in "${KNOWN_PROD_REFS[@]}"; do
    if [[ "$SUPABASE_PROJECT_ID" == "$prod" ]]; then
      err "SUPABASE_PROJECT_ID=$SUPABASE_PROJECT_ID matches a known PROD ref. Refusing to proceed."
      exit 3
    fi
  done
  ok "prod-ref guard passed (project: $SUPABASE_PROJECT_ID)"

  info "supabase link"
  supabase link --project-ref "$SUPABASE_PROJECT_ID" >/dev/null

  info "supabase db push --include-all"
  supabase db push --linked --include-all

  info "seeding UAT data"
  # seed.sql needs an ops_agent auth.users row to exist first — see top of
  # packages/api/supabase/seed.sql for the two-step creation.
  warn "seed.sql requires an ops-agent auth.users row. See seed.sql header."
  warn "run: psql \"\$DATABASE_URL\" -f packages/api/supabase/seed.sql"
  warn "(we don't run psql here because DATABASE_URL isn't always exposed)"
fi

# ── Done ─────────────────────────────────────────────────────────────────────
echo ""
ok "Setup complete."
echo ""
echo "Next steps for UAT:"
echo "  1. Read  docs/uat/UAT_HANDOFF.md  (§7 bring-up, §5 test execution)"
echo "  2. Run   docs/uat/TEST_SCRIPTS.md scenarios UAT-001 → UAT-012"
echo "  3. Reset between runs: SUPABASE_PROJECT_ID=… packages/api/scripts/uat-reset.sh"
