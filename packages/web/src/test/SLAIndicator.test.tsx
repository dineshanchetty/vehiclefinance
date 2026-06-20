/**
 * SLAIndicator — visual SLA chip for tasks.
 *
 * Branches:
 *   - dueAt is null            → "No SLA" gray chip
 *   - dueAt in the past        → overdue red chip ("Overdue by …")
 *   - dueAt < 4h away          → amber warning chip ("Due in …")
 *   - dueAt > 4h away          → green ok chip ("Due in …")
 *   - compact mode             → just the dot
 */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SLAIndicator } from '../components/SLAIndicator'

function inHours(h: number): string {
  return new Date(Date.now() + h * 60 * 60 * 1000).toISOString()
}

describe('SLAIndicator', () => {
  it('renders "No SLA" when dueAt is null', () => {
    render(<SLAIndicator dueAt={null} />)
    expect(screen.getByText(/no sla/i)).toBeInTheDocument()
  })

  it('renders overdue label when due date is in the past', () => {
    render(<SLAIndicator dueAt={inHours(-3)} />)
    expect(screen.getByText(/overdue/i)).toBeInTheDocument()
  })

  it('renders warning (amber) label when due in under 4 hours', () => {
    const { container } = render(<SLAIndicator dueAt={inHours(2)} />)
    expect(screen.getByText(/due in/i)).toBeInTheDocument()
    expect(container.querySelector('.bg-amber-50, .text-amber-700')).not.toBeNull()
  })

  it('renders ok (green) label when due more than 4 hours away', () => {
    const { container } = render(<SLAIndicator dueAt={inHours(48)} />)
    expect(screen.getByText(/due in/i)).toBeInTheDocument()
    expect(container.querySelector('.bg-green-50, .text-green-700')).not.toBeNull()
  })

  it('compact mode renders just a dot (no label)', () => {
    const { container } = render(<SLAIndicator dueAt={inHours(48)} compact />)
    expect(screen.queryByText(/due in/i)).not.toBeInTheDocument()
    expect(container.querySelector('span.h-2\\.5')).not.toBeNull()
  })

  it('compact mode + null dueAt still renders a (gray) dot', () => {
    const { container } = render(<SLAIndicator dueAt={null} compact />)
    expect(container.querySelector('.bg-green-500')).not.toBeNull()
  })
})
