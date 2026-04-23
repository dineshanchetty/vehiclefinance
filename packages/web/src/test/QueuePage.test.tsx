/**
 * QueuePage happy-path test — mocks queries.ts + realtime hook.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueuePage } from '../pages/QueuePage'
import * as queries from '../lib/queries'
import type { TaskWithDeal } from '../types/database'

const STUB_TASK: TaskWithDeal = {
  id: 'task-1',
  deal_id: 'deal-1',
  task_type: 'Review ID document for buyer',
  queue: 'Q_BUYER_DOC_REVIEW',
  status: 'PENDING',
  priority: 'HIGH',
  assigned_to: null,
  due_at: new Date(Date.now() + 3_600_000).toISOString(),
  completed_at: null,
  notes: null,
  created_at: new Date(Date.now() - 86_400_000).toISOString(),
  updated_at: new Date(Date.now() - 3_600_000).toISOString(),
  deal: {
    deal_number: 'VF-2025-010',
    status: 'BUYER_DOCS_PENDING',
    buyer: {
      id: 'b1', deal_id: 'deal-1', full_name: 'Alice Mokoena',
      id_number: '9001010000000', phone: '+27811111111', email: null,
      date_of_birth: null, gender: null, nationality: null,
      employer_name: null, employment_duration: null, monthly_income: null,
      physical_address: null, suburb: null, city: null, postal_code: null,
      consent_status: false, consent_timestamp: null,
      created_at: '', updated_at: '',
    },
    vehicle: {
      id: 'v1', deal_id: 'deal-1', make: 'Nissan', model: 'Micra', year: 2021,
      colour: null, vin: null, registration_number: null,
      odometer_reading: null, engine_number: null,
      asking_price: null, year_of_first_registration: null,
      created_at: '', updated_at: '',
    },
  },
}

vi.mock('../lib/queries', () => ({
  listTasks: vi.fn(),
  claimTask: vi.fn(),
  completeTask: vi.fn(),
  escalateTask: vi.fn(),
}))

// Mock the realtime hook — no-op for unit tests
vi.mock('../lib/realtime', () => ({
  useRealtimeTable: vi.fn(),
}))

vi.mock('../lib/auth', () => ({
  useProfile: () => null,
}))

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
    },
    channel: vi.fn(() => ({ on: vi.fn(() => ({ subscribe: vi.fn() })) })),
    removeChannel: vi.fn(),
  },
}))

describe('QueuePage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders task title and buyer name', async () => {
    vi.mocked(queries.listTasks).mockResolvedValue([STUB_TASK])

    render(
      <MemoryRouter initialEntries={['/queue/Q_BUYER_DOC_REVIEW']}>
        <Routes>
          <Route path="/queue/:queueName" element={<QueuePage />} />
        </Routes>
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByText('Review ID document for buyer')).toBeInTheDocument()
    })

    expect(screen.getByText('Alice Mokoena')).toBeInTheDocument()
    expect(screen.getByText('VF-2025-010')).toBeInTheDocument()
  })

  it('shows empty state when no tasks', async () => {
    vi.mocked(queries.listTasks).mockResolvedValue([])

    render(
      <MemoryRouter initialEntries={['/queue/Q_BUYER_DOC_REVIEW']}>
        <Routes>
          <Route path="/queue/:queueName" element={<QueuePage />} />
        </Routes>
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByText(/no tasks in this queue/i)).toBeInTheDocument()
    })
  })

  it('shows error state on query failure', async () => {
    vi.mocked(queries.listTasks).mockRejectedValue(new Error('DB timeout'))

    render(
      <MemoryRouter initialEntries={['/queue/Q_BUYER_DOC_REVIEW']}>
        <Routes>
          <Route path="/queue/:queueName" element={<QueuePage />} />
        </Routes>
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByText(/db timeout/i)).toBeInTheDocument()
    })
  })
})
