/**
 * DealDetail happy-path test — mocks queries.ts, asserts deal renders.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { DealDetail } from '../pages/DealDetail'
import * as queries from '../lib/queries'
import type { Deal } from '../types/database'

const STUB_DEAL: Deal = {
  id: 'deal-1',
  deal_number: 'VF-2025-042',
  status: 'DOCS_REVIEW',
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
    id: 'b1', first_name: 'Jane', last_name: 'Smith',
    id_number: '9001010000000', phone: '+27812345678', email: 'jane@example.com',
    date_of_birth: '1990-01-01', employment_type: 'Permanent', employer_name: 'ACME',
    monthly_income: 40000, monthly_expenses: 15000, credit_score: 720,
    address: '1 Test Street', created_at: '', updated_at: '',
  },
  seller: {
    id: 's1', first_name: 'John', last_name: 'Doe',
    id_number: null, phone: '+27811111111', email: null,
    bank_name: 'Nedbank', bank_account_number: '123456789', bank_branch_code: '198765',
    created_at: '', updated_at: '',
  },
  vehicle: {
    id: 'v1', make: 'Honda', model: 'Civic', year: 2022,
    colour: 'Blue', vin: 'VNKKTUD31FA123456', registration_number: 'GP999ZZZ',
    odometer_km: 25000, engine_number: 'ENG999', transmission: 'Automatic',
    fuel_type: 'Petrol', asking_price: 280000, agreed_price: 270000,
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
  listAuditEvents: vi.fn(),
  getNatisFulfilment: vi.fn(),
  updateDealStatus: vi.fn(),
  claimTask: vi.fn(),
  completeTask: vi.fn(),
  escalateTask: vi.fn(),
}))

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({ select: vi.fn(() => ({ order: vi.fn(() => ({ limit: vi.fn(() => ({ data: [], error: null })) })) })) }),
    channel: vi.fn(() => ({ on: vi.fn(() => ({ subscribe: vi.fn() })) })),
    removeChannel: vi.fn(),
  },
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
    vi.mocked(queries.listAuditEvents).mockResolvedValue([])
    vi.mocked(queries.getNatisFulfilment).mockResolvedValue(null)
  })

  it('renders deal header with deal number and buyer name', async () => {
    render(
      <MemoryRouter initialEntries={['/deals/deal-1']}>
        <Routes>
          <Route path="/deals/:id" element={<DealDetail />} />
        </Routes>
      </MemoryRouter>
    )

    // Loading spinner shown
    // Wait for data to load
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
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText(/not found/i)).toBeInTheDocument()
    })
  })
})
