/// <reference types="vite/client" />
import { createClient } from '@supabase/supabase-js'
import type { Database } from '../types/database'

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL ?? '') as string
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? '') as string

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase environment variables not set. Running in demo mode.')
}

export const supabase = createClient<Database>(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-key',
  {
    auth: {
      // Persist sessions across reloads (default behaviour, but explicit so
      // it can't be accidentally regressed).
      persistSession: true,
      // Auto-refresh tokens before they expire — without this, a stale token
      // after a long idle leaves the user with a half-broken session.
      autoRefreshToken: true,
      // Detect OAuth/magic-link redirects in the URL hash.
      detectSessionInUrl: true,
      // localStorage key — explicit so multiple tabs share the session and a
      // future env change can't quietly switch it.
      storageKey: 'vehiclefinance-auth',
    },
  },
)
