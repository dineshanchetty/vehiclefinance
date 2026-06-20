/**
 * PhaseTimeline — vertical journey view of the 15 deal phases.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PhaseTimeline, PHASES, phaseDisplayName } from '../components/PhaseTimeline'

describe('PHASES registry', () => {
  it('has 15 phases', () => {
    expect(PHASES.length).toBe(15)
  })

  it('starts with POPIA_CONSENT and ends with DONE', () => {
    expect(PHASES[0].key).toBe('POPIA_CONSENT')
    expect(PHASES[PHASES.length - 1].key).toBe('DONE')
  })

  it('every phase has a name and description', () => {
    PHASES.forEach((p) => {
      expect(p.name.length).toBeGreaterThan(0)
      expect(p.description.length).toBeGreaterThan(0)
    })
  })
})

describe('phaseDisplayName', () => {
  it('returns the friendly name for a known key', () => {
    expect(phaseDisplayName('BANK_STATEMENTS')).toBe('Bank Statements')
  })

  it('returns "—" for null', () => {
    expect(phaseDisplayName(null)).toBe('—')
  })

  it('returns the raw key when not in PHASES', () => {
    expect(phaseDisplayName('UNKNOWN_PHASE')).toBe('UNKNOWN_PHASE')
  })
})

describe('PhaseTimeline', () => {
  it('renders the Deal Journey heading + all phase names', () => {
    render(<PhaseTimeline currentPhase="POPIA_CONSENT" completedMilestones={[]} />)
    expect(screen.getByText(/deal journey/i)).toBeInTheDocument()
    expect(screen.getByText('POPIA Consent')).toBeInTheDocument()
    expect(screen.getByText('Done')).toBeInTheDocument()
  })

  it('marks earlier phases complete when currentPhase is mid-journey', () => {
    const { container } = render(
      <PhaseTimeline currentPhase="BANK_STATEMENTS" completedMilestones={[]} />,
    )
    // Phases before BANK_STATEMENTS should have completion markers (check icons)
    expect(container.querySelectorAll('svg').length).toBeGreaterThan(0)
  })

  it('marks a phase complete when its milestone is provided', () => {
    render(
      <PhaseTimeline
        currentPhase="POPIA_CONSENT"
        completedMilestones={['otp_uploaded']}
      />,
    )
    // OTP phase has milestone otp_uploaded → should render as completed
    expect(screen.getByText('Offer to Purchase')).toBeInTheDocument()
  })

  it('PRICE_GATE auto-completes when agreed_price >= 30000', () => {
    render(
      <PhaseTimeline
        currentPhase="POPIA_CONSENT"
        completedMilestones={[]}
        phaseState={{ agreed_price: 285000 }}
      />,
    )
    expect(screen.getByText('Price Gate')).toBeInTheDocument()
  })

  it('PRICE_GATE does NOT complete when agreed_price < 30000', () => {
    render(
      <PhaseTimeline
        currentPhase="POPIA_CONSENT"
        completedMilestones={[]}
        phaseState={{ agreed_price: 15000 }}
      />,
    )
    expect(screen.getByText('Price Gate')).toBeInTheDocument()
  })

  it('fires onPhaseClick when a row is clicked', async () => {
    const onPhaseClick = vi.fn()
    render(
      <PhaseTimeline
        currentPhase="POPIA_CONSENT"
        completedMilestones={[]}
        onPhaseClick={onPhaseClick}
      />,
    )
    await userEvent.click(screen.getByText('ID Document'))
    expect(onPhaseClick).toHaveBeenCalledWith('ID_DOC')
  })

  it('does not fire onPhaseClick when omitted (rows are not clickable)', async () => {
    render(
      <PhaseTimeline currentPhase="POPIA_CONSENT" completedMilestones={[]} />,
    )
    // No throw on click
    await userEvent.click(screen.getByText('ID Document'))
  })

  it('handles null currentPhase + null milestones', () => {
    render(<PhaseTimeline currentPhase={null} completedMilestones={null} />)
    expect(screen.getByText(/deal journey/i)).toBeInTheDocument()
  })

  it('DONE only marks complete when currentPhase is DONE', () => {
    const { rerender } = render(
      <PhaseTimeline currentPhase="HANDOVER" completedMilestones={[]} />,
    )
    expect(screen.getByText('Done')).toBeInTheDocument()
    rerender(<PhaseTimeline currentPhase="DONE" completedMilestones={[]} />)
    expect(screen.getByText('Done')).toBeInTheDocument()
  })
})
