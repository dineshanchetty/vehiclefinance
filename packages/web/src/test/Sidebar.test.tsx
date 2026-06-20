/**
 * Sidebar — primary navigation.
 *
 * Covers:
 *   - Wordmark renders with red "Tec" + FinOps subtitle
 *   - Top-level workspace items (Dashboard / Deals) render as links
 *   - Queue sub-menu collapses + expands; child links visible when open
 *   - Search filter narrows visible items
 *   - User initials are derived from profile.full_name or falls back to email
 *   - Role badge renders from profile.role
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { Sidebar } from '../components/Sidebar'

const useSession = vi.fn()
vi.mock('../lib/auth', () => ({ useSession: () => useSession() }))

function harness(initialPath = '/') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Sidebar />
    </MemoryRouter>,
  )
}

describe('Sidebar', () => {
  beforeEach(() => {
    useSession.mockReset()
    useSession.mockReturnValue({
      user: { email: 'ari@claimtec.co.za' },
      profile: { role: 'admin', full_name: 'Ari Levy' },
    })
  })

  it('renders the Claimtec wordmark and FinOps subtitle', () => {
    harness()
    expect(screen.getByText('Tec')).toBeInTheDocument()
    expect(screen.getByText('FinOps')).toBeInTheDocument()
  })

  it('renders Workspace items', () => {
    harness()
    expect(screen.getByRole('link', { name: /dashboard/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /deals/i })).toBeInTheDocument()
  })

  it('renders the Queues collapsible group', async () => {
    harness('/queue/Q_BUYER_DOC_REVIEW') // active path auto-expands the group
    // Doc Review is one of the queue children
    expect(screen.getByRole('link', { name: /doc review/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /photo review/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /escalations/i })).toBeInTheDocument()
  })

  it('Queues group toggles open/closed on click', async () => {
    harness('/') // not on a queue path — defaults closed
    expect(screen.queryByRole('link', { name: /doc review/i })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /queues/i }))
    expect(screen.getByRole('link', { name: /doc review/i })).toBeInTheDocument()
  })

  it('search filter narrows down items', async () => {
    harness()
    const search = screen.getByPlaceholderText(/search/i)
    await userEvent.type(search, 'audit')
    // Audit Log should remain
    expect(screen.getByRole('link', { name: /audit log/i })).toBeInTheDocument()
    // Dashboard should be filtered out
    expect(screen.queryByRole('link', { name: /^dashboard$/i })).not.toBeInTheDocument()
  })

  it('shows "no matches" when filter has zero hits', async () => {
    harness()
    await userEvent.type(screen.getByPlaceholderText(/search/i), 'xyznomatch')
    expect(screen.getByText(/no matches/i)).toBeInTheDocument()
  })

  it('derives initials from full_name', () => {
    harness()
    expect(screen.getByText('AL')).toBeInTheDocument() // Ari Levy
    expect(screen.getByText('Ari Levy')).toBeInTheDocument()
    expect(screen.getByText(/^admin$/i)).toBeInTheDocument()
  })

  it('falls back to email-derived initials when full_name is missing', () => {
    useSession.mockReturnValue({
      user: { email: 'ops-agent@claimtec.co.za' },
      profile: { role: 'ops_agent', full_name: null },
    })
    harness()
    // First letters of email local-part + domain start (ops-agent / claimtec) → "OC"
    // The implementation splits on space or @, takes the first letter of each — so 'ops-agent' yields 'O'.
    expect(screen.getByText(/^OC$/)).toBeInTheDocument()
  })

  it('shows "Signed out" when no session info present', () => {
    useSession.mockReturnValue({ user: null, profile: null })
    harness()
    expect(screen.getByText(/signed out/i)).toBeInTheDocument()
    expect(screen.getByText(/^guest$/i)).toBeInTheDocument()
  })

  it('Dashboard link has correct href', () => {
    harness()
    const dash = screen.getByRole('link', { name: /dashboard/i })
    expect(dash).toHaveAttribute('href', '/')
  })

  it('Audit Log link has correct href', () => {
    harness()
    const audit = screen.getByRole('link', { name: /audit log/i })
    expect(audit).toHaveAttribute('href', '/audit')
  })
})
