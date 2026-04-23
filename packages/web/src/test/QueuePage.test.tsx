/**
 * QueuePage happy-path test — mocks queries.ts + realtime hook.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueuePage } from '../pages/QueuePage'
import * as queries from '../lib/queries'
import type { Task } from '../types/database'

const STUB_TASK: Task = {
  id: 'task-1',
  deal_id: 'deal-1',
  queue: 'Q_BUYER_DOC_REVIEW',
  status: 'PENDING',
  priority: 'HIGH',
  title: 'Review ID document for buyer',
  description: null,
  assigned_to: null,
  assigned_at: null,
  due_at: new Date(Date.now() + 3_600_000).toISOString(),
  completed_at: null,
  escalated_at: null,
  escalation_reason: null,
  created_at: new Date(Date.now() - 86_400_000).toISOString(),
  updated_at: new Date(Date.now() - 3_600_000).toISOString(),
  deal: {
    deal_number: 'VF-2025-010',
    status: 'DOCS_REVIEW',
    buyer: {
      id: 'b1', first_name: 'Alice', last_name: 'Mokoena',
      id_number: '9001010000000', phone: '+27811111111', email: null,
      date_of_birth: null, employment_type: null, employer_name: null,
      monthly_income: null, monthly_expenses: null, credit_score: null,
      address: null, created_at: '', updated_at: '',
    },
    vehicle: {
      id: 'v1', make: 'Nissan', model: 'Micra', year: 2021,
      colour: null, vin: null, registration_number: null, odometer_km: null,
      engine_number: null, transmission: null, fuel_type: null,
      asking_price: null, agreed_price: null, created_at: '', updated_at: '',
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

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
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
      </MemoryRouter>
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
      </MemoryRouter>
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
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText(/db timeout/i)).toBeInTheDocument()
    })
  })
})
