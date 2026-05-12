import { useState } from 'react'
import { Car } from 'lucide-react'
import { supabase } from '../lib/supabase'

type LoginState = 'idle' | 'sending' | 'sent' | 'error'

export function LoginPage() {
  const [email, setEmail] = useState('')
  const [state, setState] = useState<LoginState>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim()) return

    setState('sending')
    setErrorMsg('')

    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: {
        emailRedirectTo: window.location.origin,
      },
    })

    if (error) {
      setErrorMsg(error.message)
      setState('error')
    } else {
      setState('sent')
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-lg ring-1 ring-gray-200">
        {/* Logo */}
        <div className="mb-6 flex flex-col items-center gap-3">
          <div
            className="flex h-12 w-12 items-center justify-center rounded-xl"
            style={{ backgroundColor: '#1B4F72' }}
          >
            <Car className="h-6 w-6 text-white" />
          </div>
          <div className="text-center">
            <h1 className="text-xl font-bold text-gray-900">VehicleFinance</h1>
            <p className="text-xs font-medium uppercase tracking-wider text-gray-400">
              Operations Portal
            </p>
          </div>
        </div>

        {/* Sent confirmation */}
        {state === 'sent' ? (
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
              <svg
                className="h-6 w-6 text-green-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
            <h2 className="text-base font-semibold text-gray-900">
              Check your email
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              We sent a magic link to <strong>{email}</strong>. Click it to sign in.
            </p>
            <button
              type="button"
              onClick={() => { setState('idle'); setEmail('') }}
              className="mt-4 text-sm font-medium text-wesbank-navy hover:text-wesbank-navy-dark"
            >
              Use a different email
            </button>
          </div>
        ) : (
          /* Sign-in form */
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="email"
                className="mb-1 block text-sm font-medium text-gray-700"
              >
                Work email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@vehiclefinance.co.za"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm placeholder-gray-400 focus:border-wesbank-navy focus:outline-none focus:ring-2 focus:ring-wesbank-navy/20"
              />
            </div>

            {state === 'error' && errorMsg && (
              <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
                {errorMsg}
              </p>
            )}

            <button
              type="submit"
              disabled={state === 'sending' || !email.trim()}
              className="w-full rounded-lg bg-wesbank-navy-dark py-2.5 text-sm font-semibold text-white hover:bg-wesbank-navy-dark disabled:opacity-50 transition-colors"
            >
              {state === 'sending' ? 'Sending…' : 'Send magic link'}
            </button>

            <p className="text-center text-xs text-gray-400">
              No password needed. We'll email you a one-time sign-in link.
            </p>
          </form>
        )}
      </div>
    </div>
  )
}
