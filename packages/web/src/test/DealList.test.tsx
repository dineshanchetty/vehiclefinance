/**
 * DealList happy-path test — mocks queries.ts, asserts live data renders.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { DealList } from '../pages/DealList'
import * as queries from '../lib/queries'

const STUB_DEALS = [
  {
    id: 'deal-1',
    deal_number: 'VF-2025-001',
    status: 'DOCS_REVIEW' as const,
    buyer_id: 'b1',
    seller_id: 's1',
    vehicle_id: 'v1',
    assigned_fni_agent_id: null,
    assigned_ops_agent_id: null,
    current_blockers: null,
    sla_due_at: null,
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-02T00:00:00Z',
    buyer: {
      id: 'b1', first_name: 'Test', last_name: 'Buyer',
      id_number: '0000000000000', phone: '+27800000000', email: null,
      date_of_birth: null, employment_type: null, employer_name: null,
      monthly_income: null, monthly_expenses: null, credit_score: null,
      address: null, created_at: '', updated_at: '',
    },
    seller: {
      id: 's1', first_name: 'Test', last_name: 'Seller',
      id_number: null, phone: '+27900000000', email: null,
      bank_name: null, bank_account_number: null, bank_branch_code: null,
      created_at: '', updated_at: '',
    },
    vehicle: {
      id: 'v1', make: 'Toyota', model: 'Corolla', year: 2020,
      colour: 'White', vin: null, registration_number: 'GP111AAA',
      odometer_km: 50000, engine_number: null, transmission: null,
      fuel_type: null, asking_price: 150000, agreed_price: 145000,
      created_at: '', updated_at: '',
    },
  },
]

vi.mock('../lib/queries', () => ({
  listDeals: vi.fn(),
}))

// Silence supabase import warning
vi.mock('../lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({ select: vi.fn(() => ({ order: vi.fn(() => ({ limit: vi.fn(() => ({ data: [], error: null })) })) })) }),
    channel: vi.fn(() => ({ on: vi.fn(() => ({ subscribe: vi.fn() })) })),
    removeChannel: vi.fn(),
  },
}))

describe('DealList', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders deal rows from live data', async () => {
    vi.mocked(queries.listDeals).mockResolvedValue(STUB_DEALS as ReturnType<typeof queries.listDeals> extends Promise<infer T> ? T : never)

    render(
      <MemoryRouter>
        <DealList />
      </MemoryRouter>
    )

    // Loading state appears initially
    expect(screen.getByText(/loading deals/i)).toBeInTheDocument()

    // Data renders
    await waitFor(() => {
      expect(screen.getByText('VF-2025-001')).toBeInTheDocument()
    })

    expect(screen.getByText('Test Buyer')).toBeInTheDocument()
    expect(screen.getByText('Test Seller')).toBeInTheDocument()
    expect(screen.getByText('2020 Toyota Corolla')).toBeInTheDocument()
  })

  it('shows error state when query fails', async () => {
    vi.mocked(queries.listDeals).mockRejectedValue(new Error('Connection refused'))

    render(
      <MemoryRouter>
        <DealList />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText(/connection refused/i)).toBeInTheDocument()
    })

    expect(screen.getByText(/retry/i)).toBeInTheDocument()
  })

  it('shows empty state when no deals returned', async () => {
    vi.mocked(queries.listDeals).mockResolvedValue([])

    render(
      <MemoryRouter>
        <DealList />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText(/no deals found/i)).toBeInTheDocument()
    })
  })
})
