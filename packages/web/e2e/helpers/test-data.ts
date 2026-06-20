/**
 * E2E test data — Claimtec FinOps demo dataset.
 *
 * These match the buyer profile baked into the existing demo fixtures
 * (docs/test-fixtures/ari-demo-fixtures.zip), so the tests can run on
 * a clean Supabase project after `pnpm e2e:seed`.
 */
export const TEST_BUYER = {
  full_name: 'CHETTY DINESHAN',
  id_number: '8501125007087',
  phone: '+27 84 809 5085',
  email: 'demo-buyer@claimtec.co.za',
}

export const TEST_SELLER = {
  full_name: 'Thabo Sipho Nkosi',
  id_number: '7806155123089',
  phone: '+27 83 456 7890',
}

export const TEST_VEHICLE = {
  make: 'Volkswagen',
  model: 'Golf 7 GTI',
  year: 2018,
  vin: 'WVWZZZAUZJW123456',
  reg: 'KK 12 LL GP',
  agreed_price: 285_000,
}

/**
 * Seed-deal helper — pure data, used by Playwright before tests run.
 * In CI this is inserted via the Supabase service role key; locally
 * the dev can also poke this into Supabase Studio manually.
 */
export const DEMO_DEAL = {
  deal_number: 'CT-E2E-001',
  status: 'BUYER_DOCS_PENDING',
  current_phase: 'BANK_STATEMENTS',
  completed_milestones: [
    'popia_consent', 'otp_uploaded', 'otp_confirmed',
    'id_verified', 'address_verified',
  ],
  phase_state: { agreed_price: TEST_VEHICLE.agreed_price },
  buyer: TEST_BUYER,
  seller: TEST_SELLER,
  vehicle: TEST_VEHICLE,
}
