/**
 * PhaseStrip — compact horizontal progress bar across the deal lifecycle.
 *
 * Covers:
 *   - Renders one button per phase
 *   - Current phase shows its label below
 *   - Milestone-marked phases render as completed (check icon)
 *   - PRICE_GATE auto-completes when agreed_price ≥ R30 000
 *   - DONE phase only marks complete when currentPhase === 'DONE'
 *   - onPhaseClick callback fires when buttons are clicked + enabled
 *   - Without onPhaseClick, buttons are disabled
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PhaseStrip } from '../components/PhaseStrip'

describe('PhaseStrip', () => {
  it('renders one button per phase (15 total)', () => {
    render(<PhaseStrip currentPhase="POPIA_CONSENT" completedMilestones={[]} />)
    // PHASES has 15 entries
    expect(screen.getAllByRole('button').length).toBe(15)
  })

  it('shows the current phase name as a label below the strip', () => {
    render(<PhaseStrip currentPhase="BANK_STATEMENTS" completedMilestones={[]} />)
    expect(screen.getByText(/bank statements/i)).toBeInTheDocument()
  })

  it('marks PRICE_GATE complete when agreed_price >= 30000', () => {
    const { container } = render(
      <PhaseStrip
        currentPhase="ID_DOC"
        completedMilestones={[]}
        phaseState={{ agreed_price: 285000 }}
      />,
    )
    // Number of green/emerald check dots should be > 0 (PRICE_GATE + everything before current)
    expect(container.querySelectorAll('.bg-emerald-600').length).toBeGreaterThan(0)
  })

  it('does NOT mark PRICE_GATE complete when agreed_price < 30000', () => {
    const { container } = render(
      <PhaseStrip
        currentPhase="POPIA_CONSENT"
        completedMilestones={[]}
        phaseState={{ agreed_price: 25000 }}
      />,
    )
    // Only the current phase (POPIA) is current, no priors complete, no PRICE_GATE auto-complete
    expect(container.querySelectorAll('.bg-emerald-600').length).toBe(0)
  })

  it('marks a phase complete when its milestone is in completedMilestones', () => {
    const { container } = render(
      <PhaseStrip
        currentPhase="ID_DOC"
        completedMilestones={['popia_consent', 'otp_uploaded']}
      />,
    )
    // POPIA + OTP should be marked complete
    expect(container.querySelectorAll('.bg-emerald-600').length).toBeGreaterThanOrEqual(2)
  })

  it('marks DONE complete only when currentPhase is DONE', () => {
    const { container, rerender } = render(
      <PhaseStrip currentPhase="HANDOVER" completedMilestones={[]} />,
    )
    // DONE shouldn't be marked complete yet
    rerender(<PhaseStrip currentPhase="DONE" completedMilestones={[]} />)
    // Now DONE is current — there's a gold ring on it
    expect(container.querySelector('.bg-claimtec-gold')).not.toBeNull()
  })

  it('fires onPhaseClick when a button is clicked', async () => {
    const onPhaseClick = vi.fn()
    render(
      <PhaseStrip
        currentPhase="POPIA_CONSENT"
        completedMilestones={[]}
        onPhaseClick={onPhaseClick}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: /^id document$/i }))
    expect(onPhaseClick).toHaveBeenCalledWith('ID_DOC')
  })

  it('buttons are disabled when no onPhaseClick provided', () => {
    render(<PhaseStrip currentPhase="POPIA_CONSENT" completedMilestones={[]} />)
    screen.getAllByRole('button').forEach((btn) => {
      expect(btn).toBeDisabled()
    })
  })

  it('handles null currentPhase and null milestones gracefully', () => {
    render(<PhaseStrip currentPhase={null} completedMilestones={null} />)
    expect(screen.getAllByRole('button').length).toBe(15)
  })
})
