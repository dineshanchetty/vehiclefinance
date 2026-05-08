import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from './supabase'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Profile {
  id: string
  email: string
  role: 'ops_agent' | 'admin'
  full_name: string | null
  created_at: string
}

interface AuthContextValue {
  session: Session | null
  user: User | null
  profile: Profile | null
  loading: boolean
}

// ── Context ───────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextValue>({
  session: null,
  user: null,
  profile: null,
  loading: true,
})

// ── AuthProvider ──────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  // Fetch the profile row for the given user id.
  // NOTE: the `profiles` table is not present in the generated Supabase types
  // yet (it was added in migration 20260417000000_auth_rls.sql; the shared
  // types/database.ts was generated earlier and needs a `pnpm gen:types`
  // refresh). Until then, cast the supabase client to work around the
  // table-name union.
  //
  // Defensive: hard-cap with a timeout so a hung query (RLS misconfig, network
  // blip on token refresh, etc.) NEVER strands the page on a forever-loader.
  const fetchProfile = async (userId: string): Promise<Profile | null> => {
    const PROFILE_TIMEOUT_MS = 5000
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = supabase as any
    try {
      const result = await Promise.race([
        client
          .from('profiles')
          .select('id, email, role, full_name, created_at')
          .eq('id', userId)
          .single()
          .then((r: { data: unknown; error: { message: string } | null }) => r),
        new Promise<{ data: null; error: { message: string } }>((resolve) =>
          setTimeout(
            () => resolve({ data: null, error: { message: `profile fetch timed out after ${PROFILE_TIMEOUT_MS}ms` } }),
            PROFILE_TIMEOUT_MS,
          ),
        ),
      ])
      if (result.error) {
        console.warn('[auth] profile fetch error:', result.error.message)
        return null
      }
      return result.data as Profile
    } catch (err) {
      console.warn('[auth] profile fetch threw:', err)
      return null
    }
  }

  useEffect(() => {
    let cancelled = false

    // Single helper: applies a session + profile in one go, ALWAYS flips
    // loading false even if the profile lookup fails or times out.
    const apply = async (s: Session | null) => {
      if (cancelled) return
      setSession(s)
      setUser(s?.user ?? null)
      try {
        const prof = s?.user ? await fetchProfile(s.user.id) : null
        if (!cancelled) setProfile(prof)
      } catch (err) {
        console.warn('[auth] apply error:', err)
        if (!cancelled) setProfile(null)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    // 1. Load the initial session (from localStorage / cookie).
    supabase.auth
      .getSession()
      .then(({ data }) => apply(data.session ?? null))
      .catch((err) => {
        console.warn('[auth] getSession failed:', err)
        if (!cancelled) {
          // No session = anonymous — at least flip loading so the user can hit
          // /login or any public page.
          setSession(null)
          setUser(null)
          setProfile(null)
          setLoading(false)
        }
      })

    // 2. Subscribe to auth state changes (sign-in, sign-out, token refresh).
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      apply(s ?? null)
    })

    // 3. Belt-and-braces hard timeout: if neither path has flipped loading
    // within 8s, give up so the page is at least interactive (will show the
    // "pending approval" screen if the profile failed; user can sign out).
    const fallback = setTimeout(() => {
      if (!cancelled) setLoading((prev) => (prev ? false : prev))
    }, 8000)

    return () => {
      cancelled = true
      clearTimeout(fallback)
      subscription.unsubscribe()
    }
  }, [])

  return (
    <AuthContext.Provider value={{ session, user, profile, loading }}>
      {children}
    </AuthContext.Provider>
  )
}

// ── Hooks ─────────────────────────────────────────────────────────────────────

/** Returns the current auth session with loading state. */
export function useSession() {
  return useContext(AuthContext)
}

/**
 * Returns the current user's profile.
 * Throws if called outside <AuthProvider>.
 */
export function useProfile(): Profile | null {
  return useContext(AuthContext).profile
}

/** Convenience helper: true if the current user has ops_agent or admin role. */
export function useIsOpsAgent(): boolean {
  const { profile } = useContext(AuthContext)
  return profile?.role === 'ops_agent' || profile?.role === 'admin'
}
