/**
 * ProtectedRoute — auth gate for the entire dashboard.
 *
 * Branches covered:
 *   - loading = true        → spinner
 *   - no session            → redirect to /login
 *   - session + no profile  → "Account Pending Approval"
 *   - session + wrong role  → "Account Pending Approval"
 *   - session + ops_agent   → renders children
 *   - session + admin       → renders children
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ProtectedRoute } from '../components/ProtectedRoute'

const useSession = vi.fn()
vi.mock('../lib/auth', () => ({ useSession: () => useSession() }))

function harness() {
  return render(
    <MemoryRouter initialEntries={['/secret']}>
      <Routes>
        <Route path="/login" element={<div>LOGIN_PAGE</div>} />
        <Route path="/secret" element={
          <ProtectedRoute>
            <div>SECRET_CONTENT</div>
          </ProtectedRoute>
        } />
      </Routes>
    </MemoryRouter>,
  )
}

describe('ProtectedRoute', () => {
  beforeEach(() => { useSession.mockReset() })

  it('renders a loading spinner while auth is loading', () => {
    useSession.mockReturnValue({ session: null, profile: null, loading: true })
    harness()
    expect(screen.getByText(/loading/i)).toBeInTheDocument()
    expect(screen.queryByText('SECRET_CONTENT')).not.toBeInTheDocument()
  })

  it('redirects to /login when there is no session', () => {
    useSession.mockReturnValue({ session: null, profile: null, loading: false })
    harness()
    expect(screen.getByText('LOGIN_PAGE')).toBeInTheDocument()
    expect(screen.queryByText('SECRET_CONTENT')).not.toBeInTheDocument()
  })

  it('shows "Account Pending Approval" when authenticated but no profile row exists', () => {
    useSession.mockReturnValue({
      session: { user: { email: 'new-user@claimtec.co.za' } },
      profile: null,
      loading: false,
    })
    harness()
    expect(screen.getByText(/account pending approval/i)).toBeInTheDocument()
    expect(screen.getByText(/new-user@claimtec.co.za/)).toBeInTheDocument()
    expect(screen.queryByText('SECRET_CONTENT')).not.toBeInTheDocument()
  })

  it('shows "Account Pending Approval" when role is not ops_agent or admin', () => {
    useSession.mockReturnValue({
      session: { user: { email: 'limited@claimtec.co.za' } },
      profile: { role: 'observer' },
      loading: false,
    })
    harness()
    expect(screen.getByText(/account pending approval/i)).toBeInTheDocument()
    expect(screen.queryByText('SECRET_CONTENT')).not.toBeInTheDocument()
  })

  it('renders children when role is ops_agent', () => {
    useSession.mockReturnValue({
      session: { user: { email: 'agent@claimtec.co.za' } },
      profile: { role: 'ops_agent' },
      loading: false,
    })
    harness()
    expect(screen.getByText('SECRET_CONTENT')).toBeInTheDocument()
  })

  it('renders children when role is admin', () => {
    useSession.mockReturnValue({
      session: { user: { email: 'admin@claimtec.co.za' } },
      profile: { role: 'admin' },
      loading: false,
    })
    harness()
    expect(screen.getByText('SECRET_CONTENT')).toBeInTheDocument()
  })
})
