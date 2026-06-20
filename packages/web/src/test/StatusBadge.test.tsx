/**
 * StatusBadge — status pill across deals, tasks, quotes, contracts, NATIS.
 *
 * Covers:
 *   - Known status renders its mapped label + colour
 *   - Unknown status falls back to humanised raw + gray
 *   - sm vs default variant changes padding
 *   - Underscores converted to spaces for fallback labels
 */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StatusBadge } from '../components/StatusBadge'

describe('StatusBadge', () => {
  it('renders the friendly label for a known deal status', () => {
    render(<StatusBadge status="QUOTE_ACCEPTED" />)
    expect(screen.getByText('Quote Accepted')).toBeInTheDocument()
  })

  it('renders the raw label (underscore-stripped) for an unknown status', () => {
    render(<StatusBadge status="CUSTOM_NEW_STATUS" />)
    expect(screen.getByText('CUSTOM NEW STATUS')).toBeInTheDocument()
  })

  it('applies the green colour for SETTLED', () => {
    const { container } = render(<StatusBadge status="SETTLED" />)
    expect(container.querySelector('.bg-green-200')).not.toBeNull()
  })

  it('applies the red colour for DECLINED', () => {
    const { container } = render(<StatusBadge status="DECLINED" />)
    expect(container.querySelector('.bg-red-100')).not.toBeNull()
  })

  it('applies the gray fallback colour for an unknown status', () => {
    const { container } = render(<StatusBadge status="MYSTERY" />)
    expect(container.querySelector('.bg-gray-100')).not.toBeNull()
  })

  it('uses the smaller padding when variant="sm"', () => {
    const { container } = render(<StatusBadge status="PENDING" variant="sm" />)
    expect(container.querySelector('.px-1\\.5')).not.toBeNull()
  })

  it('defaults to the larger padding when no variant specified', () => {
    const { container } = render(<StatusBadge status="PENDING" />)
    expect(container.querySelector('.px-2\\.5')).not.toBeNull()
  })

  it('renders correctly for priorities (LOW, HIGH, URGENT, CRITICAL)', () => {
    render(<StatusBadge status="CRITICAL" />)
    expect(screen.getByText('CRITICAL')).toBeInTheDocument()
  })
})
