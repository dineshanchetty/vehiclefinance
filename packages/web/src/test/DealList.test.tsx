/**
 * DealList happy-path test — mocks queries.ts, asserts live data renders.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { DealList } from '../pages/DealList'
import * as queries from '../lib/queries'
import type { DealWithRelations } from '../types/database'

const STUB_DEALS: DealWithRelations[] = [
  {
    id: 'deal-1',
    deal_number: 'VF-2025-001',
    status: 'BUYER_DOCS_PENDING',
    assigned_fni_analyst: null,
    assigned_seller_agent: null,
    notes: null,
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-02T00:00:00Z',
    buyer: {
      id: 'b1', deal_id: 'deal-1', full_name: 'Test Buyer',
      id_number: '0000000000000', phone: '+27800000000', email: null,
      date_of_birth: null, gender: null, nationality: null,
      employer_name: null, employment_duration: null, monthly_income: null,
      physical_address: null, suburb: null, city: null, postal_code: null,
      consent_status: false, consent_timestamp: null,
      created_at: '', updated_at: '',
    },
    seller: {
      id: 's1', deal_id: 'deal-1', full_name: 'Test Seller',
      id_number: null, phone: '+27900000000', email: null,
      consent_status: false, consent_timestamp: null,
      created_at: '', updated_at: '',
    },
    vehicle: {
      id: 'v1', deal_id: 'deal-1', make: 'Toyota', model: 'Corolla', year: 2020,
      colour: 'White', vin: null, registration_number: 'GP111AAA',
      odometer_reading: '50000 km', engine_number: null,
      asking_price: 150000, year_of_first_registration: null,
      created_at: '', updated_at: '',
    },
  },
]

vi.mock('../lib/queries', () => ({
  listDeals: vi.fn(),
}))

// Silence supabase import warning. Keeps a minimal chainable stub matching
// the usage patterns in pages.
vi.mock('../lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        order: vi.fn(() => ({
          limit: vi.fn(() => ({ data: [], error: null })),
        })),
      })),
    })),
    channel: vi.fn(() => ({ on: vi.fn(() => ({ subscribe: vi.fn() })) })),
    removeChannel: vi.fn(),
  },
}))

describe('DealList', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders deal rows from live data', async () => {
    vi.mocked(queries.listDeals).mockResolvedValue(STUB_DEALS)

    render(
      <MemoryRouter>
        <DealList />
      </MemoryRouter>,
    )

    // Loading state appears initially
    expect(screen.getByText(/loading deals/i)).toBeInTheDocument()

    // Data renders
    await waitFor(() => {
      expect(screen.getByText('VF-2025-001')).toBeInTheDocument()
    })

    expect(screen.getByText('Test Buyer')).toBeInTheDocument()
    expect(screen.getByText('Test Seller')).toBeInTheDocument()
    expect(screen.getByText(/Toyota Corolla/)).toBeInTheDocument()
  })

  it('shows error state when query fails', async () => {
    vi.mocked(queries.listDeals).mockRejectedValue(new Error('Connection refused'))

    render(
      <MemoryRouter>
        <DealList />
      </MemoryRouter>,
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
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByText(/no deals found/i)).toBeInTheDocument()
    })
  })
})
