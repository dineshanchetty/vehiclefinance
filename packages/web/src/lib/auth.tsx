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
  const fetchProfile = async (userId: string): Promise<Profile | null> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = supabase as any
    const { data, error } = await client
      .from('profiles')
      .select('id, email, role, full_name, created_at')
      .eq('id', userId)
      .single()

    if (error) {
      console.warn('[auth] profile fetch error:', error.message)
      return null
    }
    return data as Profile
  }

  useEffect(() => {
    // 1. Load the initial session (from localStorage / cookie).
    supabase.auth.getSession().then(async ({ data }) => {
      const s = data.session ?? null
      setSession(s)
      setUser(s?.user ?? null)
      if (s?.user) {
        setProfile(await fetchProfile(s.user.id))
      }
      setLoading(false)
    })

    // 2. Subscribe to auth state changes (sign-in, sign-out, token refresh).
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, s) => {
        setSession(s)
        setUser(s?.user ?? null)
        if (s?.user) {
          setProfile(await fetchProfile(s.user.id))
        } else {
          setProfile(null)
        }
        setLoading(false)
      }
    )

    return () => subscription.unsubscribe()
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
