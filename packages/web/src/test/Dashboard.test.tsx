/**
 * Dashboard happy-path test — mocks queries + supabase, asserts stat cards render.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { Dashboard } from '../pages/Dashboard'
import * as queries from '../lib/queries'

vi.mock('../lib/queries', () => ({
  listDeals: vi.fn(),
}))

const mockSupabaseCount = (count: number) => ({
  select: vi.fn().mockReturnValue({
    not: vi.fn().mockResolvedValue({ count, error: null }),
    eq: vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ count, error: null }),
    }),
  }),
})

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => mockSupabaseCount(5)),
    channel: vi.fn(() => ({ on: vi.fn(() => ({ subscribe: vi.fn() })) })),
    removeChannel: vi.fn(),
  },
}))

describe('Dashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(queries.listDeals).mockResolvedValue([])
  })

  it('renders stat card labels', async () => {
    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>
    )

    expect(screen.getByText('Operations Dashboard')).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByText('Total Active Deals')).toBeInTheDocument()
    })

    expect(screen.getByText('Pending Documents')).toBeInTheDocument()
    expect(screen.getByText('Pending Photos')).toBeInTheDocument()
    expect(screen.getByText('Quotes Pending')).toBeInTheDocument()
  })

  it('shows empty recent deals section when no deals', async () => {
    vi.mocked(queries.listDeals).mockResolvedValue([])

    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('Recent Deal Activity')).toBeInTheDocument()
    })
  })
})
