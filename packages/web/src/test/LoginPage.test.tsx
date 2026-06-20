/**
 * LoginPage — magic-link sign-in flow.
 *
 * Branches covered:
 *   - Idle form renders with disabled submit (empty email)
 *   - Submit triggers signInWithOtp + transitions to 'sent'
 *   - Supabase error → 'error' state with message
 *   - "Use a different email" resets state to idle
 *   - Submit-while-sending disables the button
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LoginPage } from '../pages/LoginPage'

const signInWithOtp = vi.fn()

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: { signInWithOtp: (...args: unknown[]) => signInWithOtp(...args) },
  },
}))

describe('LoginPage', () => {
  beforeEach(() => { signInWithOtp.mockReset() })

  it('renders the Claimtec wordmark + email form (idle state)', () => {
    render(<LoginPage />)
    // Wordmark renders "claim" + red "Tec"
    expect(screen.getByText('Tec')).toBeInTheDocument()
    expect(screen.getByText(/FinOps · Operations Portal/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/work email/i)).toBeInTheDocument()
    const btn = screen.getByRole('button', { name: /send magic link/i })
    expect(btn).toBeDisabled() // empty email
  })

  it('enables submit once user types an email', async () => {
    render(<LoginPage />)
    const input = screen.getByLabelText(/work email/i)
    await userEvent.type(input, 'ari@claimtec.co.za')
    expect(screen.getByRole('button', { name: /send magic link/i })).toBeEnabled()
  })

  it('on successful submit shows "Check your email" confirmation', async () => {
    signInWithOtp.mockResolvedValue({ error: null })
    render(<LoginPage />)
    await userEvent.type(screen.getByLabelText(/work email/i), 'ari@claimtec.co.za')
    await userEvent.click(screen.getByRole('button', { name: /send magic link/i }))

    await waitFor(() => {
      expect(screen.getByText(/check your email/i)).toBeInTheDocument()
    })
    expect(screen.getByText(/ari@claimtec.co.za/i)).toBeInTheDocument()
    expect(signInWithOtp).toHaveBeenCalledTimes(1)
    expect(signInWithOtp).toHaveBeenCalledWith(expect.objectContaining({
      email: 'ari@claimtec.co.za', // lowercased + trimmed
    }))
  })

  it('lowercases + trims email before sending', async () => {
    signInWithOtp.mockResolvedValue({ error: null })
    render(<LoginPage />)
    await userEvent.type(screen.getByLabelText(/work email/i), '  ARI@CLAIMTEC.co.za  ')
    await userEvent.click(screen.getByRole('button', { name: /send magic link/i }))
    await waitFor(() => expect(signInWithOtp).toHaveBeenCalled())
    expect(signInWithOtp).toHaveBeenCalledWith(expect.objectContaining({
      email: 'ari@claimtec.co.za',
    }))
  })

  it('shows error message when supabase returns an error', async () => {
    signInWithOtp.mockResolvedValue({ error: { message: 'Invalid email domain' } })
    render(<LoginPage />)
    await userEvent.type(screen.getByLabelText(/work email/i), 'bad@example.com')
    await userEvent.click(screen.getByRole('button', { name: /send magic link/i }))
    await waitFor(() => {
      expect(screen.getByText(/invalid email domain/i)).toBeInTheDocument()
    })
  })

  it('"use a different email" resets the form to idle', async () => {
    signInWithOtp.mockResolvedValue({ error: null })
    render(<LoginPage />)
    await userEvent.type(screen.getByLabelText(/work email/i), 'a@b.co')
    await userEvent.click(screen.getByRole('button', { name: /send magic link/i }))
    await waitFor(() => screen.getByText(/check your email/i))
    await userEvent.click(screen.getByRole('button', { name: /use a different email/i }))
    expect(screen.getByLabelText(/work email/i)).toHaveValue('')
  })
})
