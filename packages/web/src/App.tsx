import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { LogOut, User } from 'lucide-react'
import { AuthProvider, useSession } from './lib/auth'
import { ProtectedRoute } from './components/ProtectedRoute'
import { Sidebar } from './components/Sidebar'
import { Dashboard } from './pages/Dashboard'
import { DealList } from './pages/DealList'
import { DealDetail } from './pages/DealDetail'
import { QueuePage } from './pages/QueuePage'
import { AuditLog } from './pages/AuditLog'
import { LoginPage } from './pages/LoginPage'
import { ExtractionReview } from './pages/ExtractionReview'
import { supabase } from './lib/supabase'

// ── Top bar with user info and logout ─────────────────────────────────────────

function TopBar() {
  const { user, profile } = useSession()

  const handleLogout = async () => {
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  return (
    <header className="flex h-12 flex-shrink-0 items-center justify-end gap-3 border-b border-gray-200 bg-white px-4">
      {user && (
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <User className="h-4 w-4 text-gray-400" />
          <span className="hidden sm:inline">{profile?.full_name ?? user.email}</span>
          {profile?.role === 'admin' && (
            <span className="rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700">
              admin
            </span>
          )}
        </div>
      )}
      <button
        onClick={handleLogout}
        title="Sign out"
        className="flex items-center gap-1.5 rounded-md px-2 py-1 text-sm text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors"
      >
        <LogOut className="h-4 w-4" />
        <span className="hidden sm:inline">Sign out</span>
      </button>
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

      {/* Protected — require ops_agent or admin role */}
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout>
              <Dashboard />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/deals"
        element={
          <ProtectedRoute>
            <Layout>
              <DealList />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/deals/:id"
        element={
          <ProtectedRoute>
            <Layout>
              <DealDetail />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/queue/:queueName"
        element={
          <ProtectedRoute>
            <Layout>
              <QueuePage />
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
      <Route
        path="/extraction/:documentId"
        element={
          <ProtectedRoute>
            <Layout>
              <ExtractionReview />
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
