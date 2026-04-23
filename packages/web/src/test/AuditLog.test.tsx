/**
 * AuditLog happy-path test — mocks queries.ts, asserts events render.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AuditLog } from '../pages/AuditLog'
import * as queries from '../lib/queries'
import type { AuditFeedItem } from '../types/database'

const STUB_EVENTS: AuditFeedItem[] = [
  {
    id: 'ev-1',
    source: 'audit_events',
    deal_id: 'deal-1',
    event_type: 'DEAL_CREATED',
    actor: 'WhatsApp Bot',
    actor_type: 'SYSTEM',
    details: { trigger: 'buyer_opt_in' },
    created_at: '2025-01-01T09:00:00Z',
    deal: { deal_number: 'VF-2025-001' },
  },
  {
    id: 'ev-2',
    source: 'audit_logs',
    deal_id: 'deal-1',
    event_type: 'DOCUMENT_UPLOADED',
    actor: '+27812345678',
    actor_type: null,
    details: { document_type: 'SA_ID_SMART_CARD' },
    created_at: '2025-01-01T10:00:00Z',
    deal: { deal_number: 'VF-2025-001' },
  },
]

vi.mock('../lib/queries', () => ({
  listAuditFeed: vi.fn(),
}))

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
    channel: vi.fn(() => ({ on: vi.fn(() => ({ subscribe: vi.fn() })) })),
    removeChannel: vi.fn(),
  },
}))

describe('AuditLog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders audit events from live data', async () => {
    vi.mocked(queries.listAuditFeed).mockResolvedValue(STUB_EVENTS)

    render(
      <MemoryRouter>
        <AuditLog />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByText('DEAL_CREATED')).toBeInTheDocument()
    })

    expect(screen.getByText('DOCUMENT_UPLOADED')).toBeInTheDocument()
    expect(screen.getByText('WhatsApp Bot')).toBeInTheDocument()
    expect(screen.getByText('+27812345678')).toBeInTheDocument()
  })

  it('shows empty state when no events match filters', async () => {
    vi.mocked(queries.listAuditFeed).mockResolvedValue([])

    render(
      <MemoryRouter>
        <AuditLog />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByText(/no events match/i)).toBeInTheDocument()
    })
  })

  it('shows error state on query failure', async () => {
    vi.mocked(queries.listAuditFeed).mockRejectedValue(new Error('Network error'))

    render(
      <MemoryRouter>
        <AuditLog />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByText(/network error/i)).toBeInTheDocument()
    })
  })
})
