/**
 * AuthProvider — session + profile resolution with timeouts.
 *
 * Covers:
 *   - Default context (no provider) returns nulls + loading:true
 *   - useSession / useProfile / useIsOpsAgent return the latest values
 *   - With no session, loading flips to false + profile null
 *   - With a session and matching profile row, profile is populated
 *   - With a session but no profile row, useIsOpsAgent returns false
 *   - Admin + ops_agent → useIsOpsAgent true
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { AuthProvider, useSession, useProfile, useIsOpsAgent } from '../lib/auth'

// ── Supabase mock ──────────────────────────────────────────────────────────
let mockSession: { user: { id: string; email: string } } | null = null
let mockProfileRow: { id: string; role: string; email: string; full_name: string | null; created_at: string } | null = null

const onAuthStateChange = vi.fn().mockReturnValue({
  data: { subscription: { unsubscribe: vi.fn() } },
})

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(() => Promise.resolve({ data: { session: mockSession } })),
      onAuthStateChange: (cb: (event: string, s: unknown) => void) => onAuthStateChange(cb),
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve({
            data: mockProfileRow,
            error: mockProfileRow ? null : { message: 'no row' },
          }),
        }),
      }),
    }),
  },
}))

function Probe() {
  const s = useSession()
  const profile = useProfile()
  const isOps = useIsOpsAgent()
  return (
    <div>
      <span data-testid="loading">{s.loading ? 'L' : '_'}</span>
      <span data-testid="email">{s.user?.email ?? 'none'}</span>
      <span data-testid="role">{profile?.role ?? 'none'}</span>
      <span data-testid="isops">{isOps ? 'yes' : 'no'}</span>
    </div>
  )
}

beforeEach(() => {
  mockSession = null
  mockProfileRow = null
})

describe('AuthProvider', () => {
  it('starts in loading state then flips to not-loaded with no session', async () => {
    render(<AuthProvider><Probe /></AuthProvider>)
    expect(screen.getByTestId('loading')).toHaveTextContent('L')
    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('_'))
    expect(screen.getByTestId('email')).toHaveTextContent('none')
    expect(screen.getByTestId('role')).toHaveTextContent('none')
    expect(screen.getByTestId('isops')).toHaveTextContent('no')
  })

  it('populates user + profile when both session and profile row exist', async () => {
    mockSession = { user: { id: 'u-1', email: 'ari@claimtec.co.za' } }
    mockProfileRow = { id: 'u-1', role: 'admin', email: 'ari@claimtec.co.za', full_name: 'Ari', created_at: '' }
    render(<AuthProvider><Probe /></AuthProvider>)
    await waitFor(() => expect(screen.getByTestId('email')).toHaveTextContent('ari@claimtec.co.za'))
    expect(screen.getByTestId('role')).toHaveTextContent('admin')
    expect(screen.getByTestId('isops')).toHaveTextContent('yes')
  })

  it('keeps profile null if the profile row is missing (returns isOps=false)', async () => {
    mockSession = { user: { id: 'u-1', email: 'pending@claimtec.co.za' } }
    mockProfileRow = null
    render(<AuthProvider><Probe /></AuthProvider>)
    await waitFor(() => expect(screen.getByTestId('email')).toHaveTextContent('pending@claimtec.co.za'))
    expect(screen.getByTestId('role')).toHaveTextContent('none')
    expect(screen.getByTestId('isops')).toHaveTextContent('no')
  })

  it('useIsOpsAgent returns true for ops_agent role', async () => {
    mockSession = { user: { id: 'u-2', email: 'agent@claimtec.co.za' } }
    mockProfileRow = { id: 'u-2', role: 'ops_agent', email: 'agent@claimtec.co.za', full_name: null, created_at: '' }
    render(<AuthProvider><Probe /></AuthProvider>)
    await waitFor(() => expect(screen.getByTestId('isops')).toHaveTextContent('yes'))
  })

  it('useSession on a bare component (no provider) returns loading:true defaults', () => {
    render(<Probe />)
    expect(screen.getByTestId('loading')).toHaveTextContent('L')
    expect(screen.getByTestId('email')).toHaveTextContent('none')
  })
})
