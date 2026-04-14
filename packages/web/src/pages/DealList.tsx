import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, ChevronUp, ChevronDown, Filter } from 'lucide-react'
import { format } from 'date-fns'
import { supabase } from '../lib/supabase'
import { StatusBadge } from '../components/StatusBadge'
import { SLAIndicator } from '../components/SLAIndicator'
import type { Deal, DealStatus } from '../types/database'

const DEAL_STATUSES: DealStatus[] = [
  'LEAD','DOCS_PENDING','DOCS_REVIEW','FNI_REVIEW','QUOTE_PENDING','QUOTE_SENT',
  'QUOTE_ACCEPTED','INSPECTION_PENDING','INSPECTION_COMPLETE','CONTRACT_PENDING',
  'CONTRACT_SIGNED','NATIS_PENDING','NATIS_COMPLETE','SETTLED','CANCELLED','DECLINED',
]

const MOCK_DEALS: Deal[] = [
  { id: '1', deal_number: 'VF-2024-001', status: 'DOCS_REVIEW',           buyer_id: 'b1', seller_id: 's1', vehicle_id: 'v1', assigned_fni_agent_id: null, assigned_ops_agent_id: null, current_blockers: null, sla_due_at: new Date(Date.now() + 2_700_000).toISOString(),   created_at: new Date(Date.now() - 86_400_000 * 2).toISOString(), updated_at: new Date(Date.now() - 3_600_000).toISOString(),   buyer: { id: 'b1', first_name: 'Sipho',    last_name: 'Dlamini',  id_number: '9001015800084', phone: '+27823456789', email: null, date_of_birth: null, employment_type: null, employer_name: null, monthly_income: null, monthly_expenses: null, credit_score: null, address: null, created_at: '', updated_at: '' }, seller: { id: 's1', first_name: 'Johan', last_name: 'van der Merwe', id_number: null, phone: '+27114567890', email: null, bank_name: null, bank_account_number: null, bank_branch_code: null, created_at: '', updated_at: '' }, vehicle: { id: 'v1', make: 'Toyota', model: 'Corolla', year: 2019, colour: 'Silver', vin: null, registration_number: 'GP123456', odometer_km: 85000, engine_number: null, transmission: 'Manual', fuel_type: 'Petrol', asking_price: 175000, agreed_price: 168000, created_at: '', updated_at: '' } },
  { id: '2', deal_number: 'VF-2024-002', status: 'QUOTE_PENDING',          buyer_id: 'b2', seller_id: 's2', vehicle_id: 'v2', assigned_fni_agent_id: 'agent1', assigned_ops_agent_id: null, current_blockers: ['Awaiting income docs'], sla_due_at: new Date(Date.now() - 1_800_000).toISOString(),  created_at: new Date(Date.now() - 86_400_000 * 5).toISOString(), updated_at: new Date(Date.now() - 7_200_000).toISOString(),   buyer: { id: 'b2', first_name: 'Naledi',   last_name: 'Mokoena', id_number: '9305145800083', phone: '+27734567890', email: 'naledi@email.com', date_of_birth: null, employment_type: null, employer_name: null, monthly_income: null, monthly_expenses: null, credit_score: null, address: null, created_at: '', updated_at: '' }, seller: { id: 's2', first_name: 'Pieter', last_name: 'Botha', id_number: null, phone: '+27115678901', email: null, bank_name: null, bank_account_number: null, bank_branch_code: null, created_at: '', updated_at: '' }, vehicle: { id: 'v2', make: 'Volkswagen', model: 'Polo', year: 2021, colour: 'White', vin: null, registration_number: 'GP987654', odometer_km: 32000, engine_number: null, transmission: 'Automatic', fuel_type: 'Petrol', asking_price: 220000, agreed_price: 215000, created_at: '', updated_at: '' } },
  { id: '3', deal_number: 'VF-2024-003', status: 'CONTRACT_PENDING',       buyer_id: 'b3', seller_id: 's3', vehicle_id: 'v3', assigned_fni_agent_id: 'agent2', assigned_ops_agent_id: 'ops1', current_blockers: null, sla_due_at: new Date(Date.now() + 18_000_000).toISOString(),  created_at: new Date(Date.now() - 86_400_000 * 8).toISOString(), updated_at: new Date(Date.now() - 1_800_000).toISOString(),  buyer: { id: 'b3', first_name: 'Thandeka', last_name: 'Nkosi',  id_number: '8812055800082', phone: '+27823456780', email: null, date_of_birth: null, employment_type: null, employer_name: null, monthly_income: null, monthly_expenses: null, credit_score: null, address: null, created_at: '', updated_at: '' }, seller: { id: 's3', first_name: 'Thabo', last_name: 'Molete', id_number: null, phone: '+27116789012', email: null, bank_name: null, bank_account_number: null, bank_branch_code: null, created_at: '', updated_at: '' }, vehicle: { id: 'v3', make: 'Ford', model: 'Ranger', year: 2020, colour: 'Black', vin: null, registration_number: 'GP111222', odometer_km: 67000, engine_number: null, transmission: 'Automatic', fuel_type: 'Diesel', asking_price: 380000, agreed_price: 370000, created_at: '', updated_at: '' } },
  { id: '4', deal_number: 'VF-2024-004', status: 'INSPECTION_PENDING',     buyer_id: 'b4', seller_id: 's4', vehicle_id: 'v4', assigned_fni_agent_id: 'agent1', assigned_ops_agent_id: null, current_blockers: null, sla_due_at: new Date(Date.now() + 86_400_000).toISOString(),   created_at: new Date(Date.now() - 86_400_000 * 3).toISOString(), updated_at: new Date(Date.now() - 5_400_000).toISOString(),  buyer: { id: 'b4', first_name: 'Bongani',  last_name: 'Zulu',    id_number: '9507205800081', phone: '+27834567801', email: null, date_of_birth: null, employment_type: null, employer_name: null, monthly_income: null, monthly_expenses: null, credit_score: null, address: null, created_at: '', updated_at: '' }, seller: { id: 's4', first_name: 'Anele', last_name: 'Khumalo', id_number: null, phone: '+27117890123', email: null, bank_name: null, bank_account_number: null, bank_branch_code: null, created_at: '', updated_at: '' }, vehicle: { id: 'v4', make: 'Hyundai', model: 'Tucson', year: 2018, colour: 'Blue', vin: null, registration_number: 'GP333444', odometer_km: 120000, engine_number: null, transmission: 'Automatic', fuel_type: 'Petrol', asking_price: 245000, agreed_price: 230000, created_at: '', updated_at: '' } },
  { id: '5', deal_number: 'VF-2024-005', status: 'SETTLED',                buyer_id: 'b5', seller_id: 's5', vehicle_id: 'v5', assigned_fni_agent_id: 'agent2', assigned_ops_agent_id: 'ops1', current_blockers: null, sla_due_at: null,                                                  created_at: new Date(Date.now() - 86_400_000 * 20).toISOString(), updated_at: new Date(Date.now() - 86_400_000 * 1).toISOString(), buyer: { id: 'b5', first_name: 'Lerato',   last_name: 'Sithole', id_number: '0002185800080', phone: '+27845678902', email: 'lerato@email.com', date_of_birth: null, employment_type: null, employer_name: null, monthly_income: null, monthly_expenses: null, credit_score: null, address: null, created_at: '', updated_at: '' }, seller: { id: 's5', first_name: 'Carla', last_name: 'Visser', id_number: null, phone: '+27118901234', email: null, bank_name: null, bank_account_number: null, bank_branch_code: null, created_at: '', updated_at: '' }, vehicle: { id: 'v5', make: 'Kia', model: 'Picanto', year: 2022, colour: 'Red', vin: null, registration_number: 'WC555666', odometer_km: 14000, engine_number: null, transmission: 'Manual', fuel_type: 'Petrol', asking_price: 185000, agreed_price: 182000, created_at: '', updated_at: '' } },
  { id: '6', deal_number: 'VF-2024-006', status: 'FNI_REVIEW',             buyer_id: 'b6', seller_id: 's6', vehicle_id: 'v6', assigned_fni_agent_id: null, assigned_ops_agent_id: null, current_blockers: ['Credit score review pending'], sla_due_at: new Date(Date.now() + 10_800_000).toISOString(), created_at: new Date(Date.now() - 86_400_000 * 1).toISOString(), updated_at: new Date(Date.now() - 1_200_000).toISOString(), buyer: { id: 'b6', first_name: 'Mpho',     last_name: 'Radebe',  id_number: '9608305800079', phone: '+27856789012', email: null, date_of_birth: null, employment_type: null, employer_name: null, monthly_income: null, monthly_expenses: null, credit_score: null, address: null, created_at: '', updated_at: '' }, seller: { id: 's6', first_name: 'Gerrit', last_name: 'Nel', id_number: null, phone: '+27119012345', email: null, bank_name: null, bank_account_number: null, bank_branch_code: null, created_at: '', updated_at: '' }, vehicle: { id: 'v6', make: 'BMW', model: '3 Series', year: 2019, colour: 'Charcoal', vin: null, registration_number: 'WC777888', odometer_km: 75000, engine_number: null, transmission: 'Automatic', fuel_type: 'Petrol', asking_price: 420000, agreed_price: null, created_at: '', updated_at: '' } },
]

type SortKey = 'deal_number' | 'status' | 'created_at' | 'updated_at'
type SortDir = 'asc' | 'desc'

export function DealList() {
  const navigate = useNavigate()
  const [deals, setDeals] = useState<Deal[]>(MOCK_DEALS)
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<DealStatus | ''>('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('updated_at')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  const fetchDeals = useCallback(async () => {
    setLoading(true)
    try {
      let q = supabase
        .from('deals')
        .select('*, buyer:buyers(*), seller:sellers(*), vehicle:vehicles(*)')
        .order(sortKey, { ascending: sortDir === 'asc' })

      if (statusFilter) q = q.eq('status', statusFilter)
      if (dateFrom)     q = q.gte('created_at', dateFrom)
      if (dateTo)       q = q.lte('created_at', dateTo + 'T23:59:59')

      const { data } = await q.limit(100)
      if (data && data.length > 0) setDeals(data as Deal[])
    } catch {
      // stay on mock
    } finally {
      setLoading(false)
    }
  }, [statusFilter, dateFrom, dateTo, sortKey, sortDir])

  useEffect(() => { fetchDeals() }, [fetchDeals])

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(key); setSortDir('asc') }
  }

  const filtered = deals.filter((d) => {
    if (!search) return true
    const q = search.toLowerCase()
    const buyerName = d.buyer ? `${d.buyer.first_name} ${d.buyer.last_name}`.toLowerCase() : ''
    const phone = d.buyer?.phone?.toLowerCase() ?? ''
    const dealNum = d.deal_number.toLowerCase()
    return buyerName.includes(q) || phone.includes(q) || dealNum.includes(q)
  })

  const SortIcon = ({ col }: { col: SortKey }) =>
    sortKey === col
      ? sortDir === 'asc' ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />
      : <ChevronDown className="h-3.5 w-3.5 opacity-30" />

  return (
    <div className="flex flex-col h-full">
      {/* Page header */}
      <div className="border-b border-gray-200 bg-white px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Deals</h1>
            <p className="text-sm text-gray-500">{filtered.length} deals</p>
          </div>
        </div>

        {/* Filters */}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-52">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search name, phone, deal number…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-gray-400" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as DealStatus | '')}
              className="rounded-lg border border-gray-200 bg-white py-2 pl-3 pr-8 text-sm text-gray-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="">All Statuses</option>
              {DEAL_STATUSES.map((s) => (
                <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
              ))}
            </select>
          </div>

          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="rounded-lg border border-gray-200 bg-white py-2 px-3 text-sm text-gray-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            placeholder="From"
          />
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="rounded-lg border border-gray-200 bg-white py-2 px-3 text-sm text-gray-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            placeholder="To"
          />
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto p-6">
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="bg-gray-50">
              <tr>
                {[
                  { key: 'deal_number' as SortKey, label: 'Deal #' },
                  { key: null, label: 'Buyer' },
                  { key: null, label: 'Seller' },
                  { key: null, label: 'Vehicle' },
                  { key: 'status' as SortKey, label: 'Status' },
                  { key: 'created_at' as SortKey, label: 'Created' },
                  { key: 'updated_at' as SortKey, label: 'Updated' },
                  { key: null, label: 'SLA' },
                ].map(({ key, label }) => (
                  <th
                    key={label}
                    onClick={() => key && toggleSort(key)}
                    className={`border-b border-gray-200 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 ${key ? 'cursor-pointer select-none hover:text-gray-800' : ''}`}
                  >
                    <div className="flex items-center gap-1">
                      {label}
                      {key && <SortIcon col={key} />}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading && (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-sm text-gray-400">
                    Loading deals…
                  </td>
                </tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-sm text-gray-400">
                    No deals found
                  </td>
                </tr>
              )}
              {!loading && filtered.map((deal) => (
                <tr
                  key={deal.id}
                  onClick={() => navigate(`/deals/${deal.id}`)}
                  className="cursor-pointer hover:bg-blue-50/50 transition-colors"
                >
                  <td className="px-4 py-3.5">
                    <span className="font-semibold text-gray-900">{deal.deal_number}</span>
                    {deal.current_blockers && deal.current_blockers.length > 0 && (
                      <div className="mt-0.5 flex items-center gap-1">
                        <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                        <span className="text-xs text-red-600">{deal.current_blockers[0]}</span>
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3.5">
                    {deal.buyer
                      ? <div>
                          <p className="font-medium text-gray-900">{deal.buyer.first_name} {deal.buyer.last_name}</p>
                          <p className="text-xs text-gray-400">{deal.buyer.phone}</p>
                        </div>
                      : <span className="text-gray-400">—</span>}
                  </td>
                  <td className="px-4 py-3.5 text-gray-700">
                    {deal.seller
                      ? `${deal.seller.first_name} ${deal.seller.last_name}`
                      : <span className="text-gray-400">—</span>}
                  </td>
                  <td className="px-4 py-3.5">
                    {deal.vehicle
                      ? <div>
                          <p className="font-medium text-gray-900">{deal.vehicle.year} {deal.vehicle.make} {deal.vehicle.model}</p>
                          <p className="text-xs text-gray-400">
                            {deal.vehicle.registration_number}
                            {deal.vehicle.odometer_km ? ` · ${deal.vehicle.odometer_km.toLocaleString()} km` : ''}
                          </p>
                        </div>
                      : <span className="text-gray-400">—</span>}
                  </td>
                  <td className="px-4 py-3.5">
                    <StatusBadge status={deal.status} />
                  </td>
                  <td className="px-4 py-3.5 text-xs text-gray-500">
                    {format(new Date(deal.created_at), 'dd MMM yyyy')}
                  </td>
                  <td className="px-4 py-3.5 text-xs text-gray-500">
                    {format(new Date(deal.updated_at), 'dd MMM HH:mm')}
                  </td>
                  <td className="px-4 py-3.5">
                    <SLAIndicator dueAt={deal.sla_due_at} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
