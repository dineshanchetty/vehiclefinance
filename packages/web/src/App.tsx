import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Sidebar } from './components/Sidebar'
import { Dashboard } from './pages/Dashboard'
import { DealList } from './pages/DealList'
import { DealDetail } from './pages/DealDetail'
import { QueuePage } from './pages/QueuePage'
import { AuditLog } from './pages/AuditLog'

function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  )
}

function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/"                  element={<Dashboard />} />
          <Route path="/deals"             element={<DealList />} />
          <Route path="/deals/:id"         element={<DealDetail />} />
          <Route path="/queue/:queueName"  element={<QueuePage />} />
          <Route path="/audit"             element={<AuditLog />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  )
}

export default App
