/**
 * DealDetail happy-path test — mocks queries.ts, asserts deal renders.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { DealDetail } from '../pages/DealDetail'
import * as queries from '../lib/queries'
import type { DealWithRelations } from '../types/database'

const STUB_DEAL: DealWithRelations = {
  id: 'deal-1',
  deal_number: 'VF-2025-042',
  status: 'BUYER_DOCS_PENDING',
  assigned_fni_analyst: null,
  assigned_seller_agent: null,
  notes: null,
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-02T00:00:00Z',
  buyer: {
    id: 'b1', deal_id: 'deal-1', full_name: 'Jane Smith',
    id_number: '9001010000000', phone: '+27812345678', email: 'jane@example.com',
    date_of_birth: '1990-01-01', gender: null, nationality: 'RSA',
    employer_name: 'ACME', employment_duration: '5y', monthly_income: 40000,
    physical_address: '1 Test Street', suburb: null, city: 'Cape Town', postal_code: '8001',
    consent_status: true, consent_timestamp: null,
    created_at: '', updated_at: '',
  },
  seller: {
    id: 's1', deal_id: 'deal-1', full_name: 'John Doe',
    id_number: null, phone: '+27811111111', email: null,
    consent_status: true, consent_timestamp: null,
    created_at: '', updated_at: '',
  },
  vehicle: {
    id: 'v1', deal_id: 'deal-1', make: 'Honda', model: 'Civic', year: 2022,
    colour: 'Blue', vin: 'VNKKTUD31FA123456', registration_number: 'GP999ZZZ',
    odometer_reading: '25000 km', engine_number: 'ENG999',
    asking_price: 280000, year_of_first_registration: 2022,
    created_at: '', updated_at: '',
  },
}

vi.mock('../lib/queries', () => ({
  getDeal: vi.fn(),
  listDocuments: vi.fn(),
  listQuotes: vi.fn(),
  getInspection: vi.fn(),
  listContracts: vi.fn(),
  listTasks: vi.fn(),
  listAuditFeed: vi.fn(),
  listExtractionResults: vi.fn(),
  getNatisFulfilment: vi.fn(),
  updateDealStatus: vi.fn(),
  claimTask: vi.fn(),
  completeTask: vi.fn(),
  escalateTask: vi.fn(),
}))

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        order: vi.fn(() => ({
          limit: vi.fn(() => ({ data: [], error: null })),
        })),
      })),
    })),
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
    },
    channel: vi.fn(() => ({ on: vi.fn(() => ({ subscribe: vi.fn() })) })),
    removeChannel: vi.fn(),
  },
}))

// The auth context is Phase-2 code — stub useProfile so DealDetail renders
// without an AuthProvider wrapper.
vi.mock('../lib/auth', () => ({
  useProfile: () => null,
}))

// Stub child components that do their own Supabase calls
vi.mock('../components/VehiclePhotoPanel', () => ({ VehiclePhotoPanel: () => <div>PhotoPanel</div> }))
vi.mock('../components/ExtractionConfidencePanel', () => ({ ExtractionConfidencePanel: () => <div>ExtractionPanel</div> }))

describe('DealDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(queries.getDeal).mockResolvedValue(STUB_DEAL)
    vi.mocked(queries.listDocuments).mockResolvedValue([])
    vi.mocked(queries.listQuotes).mockResolvedValue([])
    vi.mocked(queries.getInspection).mockResolvedValue(null)
    vi.mocked(queries.listContracts).mockResolvedValue([])
    vi.mocked(queries.listTasks).mockResolvedValue([])
    vi.mocked(queries.listAuditFeed).mockResolvedValue([])
    vi.mocked(queries.listExtractionResults).mockResolvedValue([])
    vi.mocked(queries.getNatisFulfilment).mockResolvedValue(null)
  })

  it('renders deal header with deal number and buyer name', async () => {
    render(
      <MemoryRouter initialEntries={['/deals/deal-1']}>
        <Routes>
          <Route path="/deals/:id" element={<DealDetail />} />
        </Routes>
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByText('VF-2025-042')).toBeInTheDocument()
    })

    expect(screen.getByText(/Jane Smith/)).toBeInTheDocument()
    expect(screen.getByText(/Honda Civic/)).toBeInTheDocument()
  })

  it('shows error state when deal not found', async () => {
    vi.mocked(queries.getDeal).mockRejectedValue(new Error('Not found'))

    render(
      <MemoryRouter initialEntries={['/deals/bad-id']}>
        <Routes>
          <Route path="/deals/:id" element={<DealDetail />} />
        </Routes>
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByText(/not found/i)).toBeInTheDocument()
    })
  })
})
