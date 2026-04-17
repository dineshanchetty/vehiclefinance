/**
 * test-rls.ts — Row-Level Security integration tests
 *
 * Phase 2 / UAT Track B
 *
 * Run with:
 *   deno test --allow-env --allow-net packages/api/tests/test-rls.ts
 *
 * Required environment variables:
 *   SUPABASE_URL              — project URL
 *   SUPABASE_ANON_KEY         — public anon key
 *   SUPABASE_SERVICE_ROLE_KEY — service-role key (for seeding only)
 *   TEST_OPS_EMAIL            — email of seeded ops_agent user (optional)
 *   TEST_OPS_PASSWORD         — password for that user   (optional)
 *
 * If TEST_OPS_EMAIL / TEST_OPS_PASSWORD are not set, the ops_agent tests
 * are SKIPPED with a clear message. The anon-denial tests always run.
 *
 * NOTE: The ops_agent auth.users row must be created in advance via the
 * Supabase dashboard or the CLI:
 *   supabase auth users create --email ops@test.local --password Test1234!
 * Then apply seed.sql to insert the matching profile row.
 */

import {
  assertEquals,
  assertExists,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

// ── Helpers ───────────────────────────────────────────────────────────────────

function env(key: string): string | undefined {
  return Deno.env.get(key);
}

function requireEnv(key: string): string {
  const v = env(key);
  if (!v) throw new Error(`Missing required env var: ${key}`);
  return v;
}

function skipTest(name: string, reason: string): void {
  console.log(`[SKIP] ${name}: ${reason}`);
}

const SUPABASE_URL      = requireEnv('SUPABASE_URL');
const SUPABASE_ANON_KEY = requireEnv('SUPABASE_ANON_KEY');

/** Anon client — no session, should be blocked by RLS on all tables. */
function makeAnonClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Ops-agent client — signs in with email+password. */
async function makeOpsClient(email: string, password: string): Promise<SupabaseClient> {
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`Ops sign-in failed: ${error.message}`);
  return client;
}

// ── Anon denial tests (always run) ───────────────────────────────────────────

Deno.test('anon: SELECT on deals returns 0 rows (RLS blocks)', async () => {
  const anon = makeAnonClient();
  const { data, error } = await anon.from('deals').select('id').limit(10);
  // Supabase with RLS enabled returns empty array (not an error) for SELECT;
  // policies that deny simply filter out all rows.
  if (error) {
    // Some Supabase configs return a 42501 error for anon SELECT; both are valid.
    console.log(`  anon SELECT denied with error: ${error.code} ${error.message}`);
    return;
  }
  assertEquals(
    data?.length ?? 0,
    0,
    'Expected RLS to return 0 rows for anon SELECT on deals',
  );
});

Deno.test('anon: SELECT on buyers returns 0 rows (RLS blocks)', async () => {
  const anon = makeAnonClient();
  const { data, error } = await anon.from('buyers').select('id').limit(10);
  if (error) {
    console.log(`  anon SELECT on buyers denied with error: ${error.code} ${error.message}`);
    return;
  }
  assertEquals(data?.length ?? 0, 0, 'Expected 0 rows for anon SELECT on buyers');
});

Deno.test('anon: SELECT on sellers returns 0 rows (RLS blocks)', async () => {
  const anon = makeAnonClient();
  const { data, error } = await anon.from('sellers').select('id').limit(10);
  if (error) {
    console.log(`  anon SELECT on sellers denied with error: ${error.code} ${error.message}`);
    return;
  }
  assertEquals(data?.length ?? 0, 0, 'Expected 0 rows for anon SELECT on sellers');
});

Deno.test('anon: SELECT on audit_events returns 0 rows (RLS blocks)', async () => {
  const anon = makeAnonClient();
  const { data, error } = await anon.from('audit_events').select('id').limit(10);
  if (error) {
    console.log(`  anon SELECT on audit_events denied: ${error.code} ${error.message}`);
    return;
  }
  assertEquals(data?.length ?? 0, 0, 'Expected 0 rows for anon SELECT on audit_events');
});

Deno.test('anon: INSERT on deals is blocked by RLS', async () => {
  const anon = makeAnonClient();
  const { error } = await anon.from('deals').insert({
    deal_number: 'TEST-ANON-001',
    status: 'APPLICATION_INITIATED',
  });
  assertExists(error, 'Expected anon INSERT on deals to fail');
  console.log(`  anon INSERT denied: ${error.code} ${error.message}`);
});

Deno.test('anon: INSERT on tasks is blocked by RLS', async () => {
  const anon = makeAnonClient();
  const { error } = await anon.from('tasks').insert({
    queue: 'Q_BUYER_DOC_REVIEW',
    status: 'PENDING',
    priority: 'MEDIUM',
    title: 'anon-rls-test',
  });
  assertExists(error, 'Expected anon INSERT on tasks to fail');
  console.log(`  anon INSERT on tasks denied: ${error.code} ${error.message}`);
});

// ── Ops-agent allowed tests (skipped if credentials not set) ─────────────────

const OPS_EMAIL    = env('TEST_OPS_EMAIL');
const OPS_PASSWORD = env('TEST_OPS_PASSWORD');
const OPS_SKIP_REASON =
  'TEST_OPS_EMAIL and TEST_OPS_PASSWORD not set. ' +
  'Create the auth user via Supabase dashboard and apply seed.sql, then set these vars.';

Deno.test('ops_agent: SELECT on deals succeeds', async () => {
  if (!OPS_EMAIL || !OPS_PASSWORD) {
    skipTest('ops_agent: SELECT on deals succeeds', OPS_SKIP_REASON);
    return;
  }
  const ops = await makeOpsClient(OPS_EMAIL, OPS_PASSWORD);
  const { data, error } = await ops.from('deals').select('id').limit(5);
  if (error) {
    throw new Error(`ops_agent SELECT on deals failed: ${error.message}`);
  }
  console.log(`  ops_agent can see ${data?.length ?? 0} deals`);
  // We don't assert a specific count — just that no error occurred.
});

Deno.test('ops_agent: SELECT on audit_events succeeds', async () => {
  if (!OPS_EMAIL || !OPS_PASSWORD) {
    skipTest('ops_agent: SELECT on audit_events succeeds', OPS_SKIP_REASON);
    return;
  }
  const ops = await makeOpsClient(OPS_EMAIL, OPS_PASSWORD);
  const { error } = await ops.from('audit_events').select('id').limit(5);
  if (error) {
    throw new Error(`ops_agent SELECT on audit_events failed: ${error.message}`);
  }
});

Deno.test('ops_agent: SELECT own profile row succeeds', async () => {
  if (!OPS_EMAIL || !OPS_PASSWORD) {
    skipTest('ops_agent: SELECT own profile row succeeds', OPS_SKIP_REASON);
    return;
  }
  const ops = await makeOpsClient(OPS_EMAIL, OPS_PASSWORD);
  const user = (await ops.auth.getUser()).data.user;
  assertExists(user, 'Expected authenticated user');

  const { data, error } = await ops
    .from('profiles')
    .select('id, email, role')
    .eq('id', user.id)
    .single();

  if (error) throw new Error(`ops_agent profile SELECT failed: ${error.message}`);
  assertEquals(data.email, OPS_EMAIL, 'Profile email should match signed-in user');
  console.log(`  ops_agent profile: ${data.email} role=${data.role}`);
});

Deno.test('ops_agent: INSERT + cleanup on tasks succeeds', async () => {
  if (!OPS_EMAIL || !OPS_PASSWORD) {
    skipTest('ops_agent: INSERT + cleanup on tasks succeeds', OPS_SKIP_REASON);
    return;
  }
  const ops = await makeOpsClient(OPS_EMAIL, OPS_PASSWORD);

  // Ops agents need a deal_id for tasks (FK). Skip if no deals exist.
  const { data: deals } = await ops.from('deals').select('id').limit(1);
  const dealId = deals?.[0]?.id;
  if (!dealId) {
    skipTest(
      'ops_agent: INSERT + cleanup on tasks succeeds',
      'No deals in DB — cannot create task (FK). Seed a deal first.',
    );
    return;
  }

  const { data: inserted, error: insertError } = await ops
    .from('tasks')
    .insert({
      deal_id: dealId,
      queue: 'Q_BUYER_DOC_REVIEW',
      status: 'PENDING',
      priority: 'LOW',
      title: 'rls-test-task — safe to delete',
    })
    .select('id')
    .single();

  if (insertError) throw new Error(`ops_agent task INSERT failed: ${insertError.message}`);
  assertExists(inserted?.id, 'Inserted task should have an id');

  // Cleanup
  await ops.from('tasks').delete().eq('id', inserted.id);
  console.log(`  ops_agent INSERT task id=${inserted.id} — ok; cleaned up`);
});

Deno.test('ops_agent: UPDATE task status succeeds', async () => {
  if (!OPS_EMAIL || !OPS_PASSWORD) {
    skipTest('ops_agent: UPDATE task status succeeds', OPS_SKIP_REASON);
    return;
  }
  const ops = await makeOpsClient(OPS_EMAIL, OPS_PASSWORD);

  // Find any existing PENDING task to update
  const { data: tasks } = await ops
    .from('tasks')
    .select('id, status')
    .eq('status', 'PENDING')
    .limit(1);

  const task = tasks?.[0];
  if (!task) {
    skipTest(
      'ops_agent: UPDATE task status succeeds',
      'No PENDING tasks in DB to test update. Seed tasks first.',
    );
    return;
  }

  const { error } = await ops
    .from('tasks')
    .update({ status: 'PENDING' }) // update to same value — harmless
    .eq('id', task.id);

  if (error) throw new Error(`ops_agent task UPDATE failed: ${error.message}`);
  console.log(`  ops_agent UPDATE task id=${task.id} — ok`);
});
