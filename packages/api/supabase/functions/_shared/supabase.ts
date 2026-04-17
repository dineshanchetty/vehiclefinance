// Shared Supabase client helper for Edge Functions.
// Every edge function in this directory calls getSupabaseClient() to obtain
// a service-role client (bypasses RLS — edge functions run server-side).
//
// Reads secrets from the Deno env:
//   SUPABASE_URL                — project URL
//   SUPABASE_SERVICE_ROLE_KEY   — service role key (NOT the anon key)
//
// Secrets are set via `supabase secrets set` or via the dashboard.

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2"

let _client: SupabaseClient | null = null

export function getSupabaseClient(): SupabaseClient {
  if (_client) return _client
  const url = Deno.env.get("SUPABASE_URL")
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
  if (!url || !key) {
    throw new Error(
      "Edge function is missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars. " +
      "Set them via `supabase secrets set` before deploying.",
    )
  }
  _client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return _client
}
