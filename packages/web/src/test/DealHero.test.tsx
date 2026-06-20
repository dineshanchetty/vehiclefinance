/**
 * DealHero — single-line summary bar above the phase strip.
 */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DealHero } from '../components/DealHero'
import type { DealWithRelations } from '../types/database'

const baseDeal: DealWithRelations & {
  current_phase?: string | null
  phase_state?: Record<string, unknown> | null
  completed_milestones?: string[] | null
} = {
  id: 'd-1',
  deal_number: 'CT-2026-001',
  status: 'BUYER_DOCS_PENDING',
  assigned_fni_analyst: null,
  assigned_seller_agent: null,
  notes: null,
  created_at: new Date(Date.now() - 86_400_000 * 3).toISOString(),
  updated_at: new Date().toISOString(),
  buyer: {
    id: 'b1', deal_id: 'd-1', full_name: 'Ari Levy',
    id_number: '8501125007087', phone: '+27 84 809 5085', email: null,
    date_of_birth: null, gender: null, nationality: null,
    employer_name: null, employment_duration: null, monthly_income: null,
    physical_address: null, suburb: null, city: null, postal_code: null,
    consent_status: false, consent_timestamp: null,
    created_at: '', updated_at: '',
  },
  vehicle: {
    id: 'v1', deal_id: 'd-1', make: 'Volkswagen', model: 'Golf GTI', year: 2018,
    colour: null, vin: null, registration_number: null,
    odometer_reading: null, engine_number: null,
    asking_price: null, year_of_first_registration: null,
    created_at: '', updated_at: '',
  },
  phase_state: { agreed_price: 285_000 },
}

describe('DealHero', () => {
  it('renders vehicle / buyer / price labels + values', () => {
    render(<DealHero deal={baseDeal} />)
    expect(screen.getByText('Vehicle')).toBeInTheDocument()
    expect(screen.getByText('Buyer')).toBeInTheDocument()
    expect(screen.getByText('Price')).toBeInTheDocument()
    expect(screen.getByText('2018 Volkswagen Golf GTI')).toBeInTheDocument()
    expect(screen.getByText('Ari Levy')).toBeInTheDocument()
    expect(screen.getByText('R 285,000')).toBeInTheDocument()
  })

  it('renders the elapsed time (formatDistanceToNow)', () => {
    render(<DealHero deal={baseDeal} />)
    expect(screen.getByText(/3 days/i)).toBeInTheDocument()
  })

  it('shows "—" when vehicle is missing', () => {
    render(<DealHero deal={{ ...baseDeal, vehicle: null as never }} />)
    // The vehicle field cell should now contain a dash
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
  })

  it('shows "—" when agreed_price is missing', () => {
    render(<DealHero deal={{ ...baseDeal, phase_state: {} }} />)
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
  })

  it('shows "—" when buyer is missing', () => {
    render(<DealHero deal={{ ...baseDeal, buyer: null as never }} />)
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
  })

  it('handles null phase_state', () => {
    render(<DealHero deal={{ ...baseDeal, phase_state: null }} />)
    expect(screen.getByText('Price')).toBeInTheDocument()
  })

  it('handles null created_at by showing "—" for elapsed', () => {
    render(<DealHero deal={{ ...baseDeal, created_at: null as never }} />)
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
  })
})
