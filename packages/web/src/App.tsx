import { useState, useRef, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation, useParams, Link } from 'react-router-dom'
import { LogOut, User, Bell, ChevronRight, ChevronDown } from 'lucide-react'
import { AuthProvider, useSession } from './lib/auth'
import { ProtectedRoute } from './components/ProtectedRoute'
import { Sidebar } from './components/Sidebar'
import { AuditLog } from './pages/AuditLog'
import { LoginPage } from './pages/LoginPage'
import { RecoveryPage } from './pages/RecoveryPage'
import { RecoveryLeadDetail } from './pages/RecoveryLeadDetail'
import { supabase } from './lib/supabase'

// ── Top bar with title, breadcrumb, bell, and user menu ───────────────────────

type Crumb = { label: string; to?: string }

function usePageCrumbs(): { title: string; crumbs: Crumb[] } {
  const { pathname } = useLocation()
  const params = useParams()

  if (pathname === '/' || pathname === '' || pathname === '/recovery') {
    return { title: 'Recovery', crumbs: [{ label: 'Recovery' }] }
  }
  if (pathname.startsWith('/recovery/')) {
    const id = params.id ?? pathname.split('/').pop() ?? ''
    return {
      title: 'Lead',
      crumbs: [{ label: 'Recovery', to: '/recovery' }, { label: id ? id.slice(0, 8) : 'Detail' }],
    }
  }
  if (pathname === '/audit') {
    return { title: 'Audit Log', crumbs: [{ label: 'Audit Log' }] }
  }
  return { title: '', crumbs: [] }
}

function TopBar() {
  const { user, profile } = useSession()
  const { title, crumbs } = usePageCrumbs()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!menuOpen) return
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [menuOpen])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  const displayName = profile?.full_name ?? user?.email ?? 'Signed out'

  return (
    <header className="flex h-14 flex-shrink-0 items-center gap-4 border-b border-gray-200 bg-white px-5">
      {/* Left: title + breadcrumb */}
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-sm font-semibold text-gray-900 leading-tight">{title}</h1>
        {crumbs.length > 1 && (
          <nav className="mt-0.5 flex items-center gap-1 text-[11px] text-gray-500">
            {crumbs.map((c, i) => (
              <span key={i} className="flex items-center gap-1">
                {i > 0 && <ChevronRight className="h-3 w-3 text-gray-300" />}
                {c.to ? (
                  <Link to={c.to} className="hover:text-claimtec-forest transition-colors">
                    {c.label}
                  </Link>
                ) : (
                  <span className={i === crumbs.length - 1 ? 'text-gray-700' : ''}>{c.label}</span>
                )}
              </span>
            ))}
          </nav>
        )}
      </div>

      {/* Right: bell + user menu */}
      {user && (
        <div className="flex items-center gap-1">
          <button
            type="button"
            title="Notifications"
            className="relative flex h-8 w-8 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-claimtec-forest transition-colors"
          >
            <Bell className="h-4 w-4" />
          </button>

          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-gray-700 hover:bg-gray-100 hover:text-claimtec-forest transition-colors"
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-claimtec-forest text-[10px] font-bold text-white">
                {(displayName.match(/\b\w/g) ?? ['?']).slice(0, 2).join('').toUpperCase()}
              </span>
              <span className="hidden md:inline max-w-[160px] truncate">{displayName}</span>
              {profile?.role === 'admin' && (
                <span className="hidden md:inline rounded-full bg-claimtec-gold/30 px-1.5 py-0.5 text-[10px] font-semibold text-claimtec-forest">
                  admin
                </span>
              )}
              <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
            </button>

            {menuOpen && (
              <div className="absolute right-0 top-full z-50 mt-1 w-56 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg">
                <div className="border-b border-gray-100 px-3 py-2">
                  <p className="truncate text-xs font-semibold text-gray-900">{displayName}</p>
                  <p className="truncate text-[11px] text-gray-500">{profile?.role ?? 'guest'}</p>
                </div>
                <button
                  type="button"
                  disabled
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-400 cursor-not-allowed"
                  title="Coming soon"
                >
                  <User className="h-4 w-4" /> Profile
                </button>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="flex w-full items-center gap-2 border-t border-gray-100 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 hover:text-claimtec-forest transition-colors"
                >
                  <LogOut className="h-4 w-4" /> Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </header>
  )
}

// ── Main layout ───────────────────────────────────────────────────────────────

function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar />
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  )
}

// ── Router ────────────────────────────────────────────────────────────────────

function AppRoutes() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/login" element={<LoginPage />} />

      {/* Protected — require ops_agent or admin role.
          This app is now the recovery platform: Absa originates + declines in
          its own systems; we ingest and run the recovery workstreams. The old
          origination surface (Deals, Queues, doc/extraction review) is retired. */}
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout>
              <RecoveryPage />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/recovery"
        element={
          <ProtectedRoute>
            <Layout>
              <RecoveryPage />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/recovery/:id"
        element={
          <ProtectedRoute>
            <Layout>
              <RecoveryLeadDetail />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/audit"
        element={
          <ProtectedRoute>
            <Layout>
              <AuditLog />
            </Layout>
          </ProtectedRoute>
        }
      />

      {/* Catch-all */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
