import { type ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useSession } from '../lib/auth'

interface ProtectedRouteProps {
  children: ReactNode
}

/**
 * ProtectedRoute
 *
 * Behaviour:
 *  - While auth is loading  → shows a full-screen spinner.
 *  - No session             → redirects to /login.
 *  - Authenticated but NOT ops_agent / admin → shows "pending approval" screen.
 *  - Authenticated + ops_agent or admin      → renders children.
 */
export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { session, profile, loading } = useSession()

  // ── Loading state ──────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
          <p className="text-sm text-gray-500">Loading…</p>
        </div>
      </div>
    )
  }

  // ── Not authenticated ──────────────────────────────────────────────────────
  if (!session) {
    return <Navigate to="/login" replace />
  }

  // ── Authenticated but role not yet approved ────────────────────────────────
  if (!profile || (profile.role !== 'ops_agent' && profile.role !== 'admin')) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-gray-50 p-6">
        <div className="max-w-sm text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-amber-100">
            <svg
              className="h-7 w-7 text-amber-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
              />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-gray-900">
            Account Pending Approval
          </h2>
          <p className="mt-2 text-sm text-gray-500">
            Your account ({session.user.email}) has been created but has not yet been granted access to the Operations Portal. Please contact your administrator.
          </p>
          <button
            onClick={() => window.location.href = '/login'}
            className="mt-5 rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700"
          >
            Sign out
          </button>
        </div>
      </div>
    )
  }

  // ── Authorised ────────────────────────────────────────────────────────────
  return <>{children}</>
}
