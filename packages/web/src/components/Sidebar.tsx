import { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import {
  LayoutDashboard,
  FileText,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Camera,
  Calculator,
  Wrench,
  FileSignature,
  CheckSquare,
  Car,
  AlertCircle,
  ScrollText,
  Search,
  Users,
} from 'lucide-react'

interface NavItem {
  label: string
  path?: string
  icon: React.ReactNode
  children?: NavItem[]
}

const queueItems: NavItem[] = [
  { label: 'Doc Review',    path: '/queue/Q_BUYER_DOC_REVIEW',   icon: <FileText className="h-4 w-4" /> },
  { label: 'Photo Review',  path: '/queue/Q_SELLER_PHOTO_REVIEW', icon: <Camera className="h-4 w-4" /> },
  { label: 'F&I Review',    path: '/queue/Q_FNI_REVIEW',          icon: <Search className="h-4 w-4" /> },
  { label: 'Quote Prep',    path: '/queue/Q_FNI_QUOTE_PREP',      icon: <Calculator className="h-4 w-4" /> },
  { label: 'Inspections',   path: '/queue/Q_HARTCON_INSPECTION',  icon: <Wrench className="h-4 w-4" /> },
  { label: 'Contracts',     path: '/queue/Q_SELLER_CONTRACT',     icon: <FileSignature className="h-4 w-4" /> },
  { label: 'Approvals',     path: '/queue/Q_DEAL_APPROVAL',       icon: <CheckSquare className="h-4 w-4" /> },
  { label: 'NATIS',         path: '/queue/Q_NATIS_FULFILMENT',    icon: <Car className="h-4 w-4" /> },
  { label: 'Escalations',   path: '/queue/Q_HUMAN_ESCALATION',   icon: <AlertCircle className="h-4 w-4" /> },
]

const navItems: NavItem[] = [
  { label: 'Dashboard',  path: '/',       icon: <LayoutDashboard className="h-4 w-4" /> },
  { label: 'Deals',      path: '/deals',  icon: <Users className="h-4 w-4" /> },
  {
    label: 'Queues',
    icon: <ClipboardList className="h-4 w-4" />,
    children: queueItems,
  },
  { label: 'Audit Log',  path: '/audit',  icon: <ScrollText className="h-4 w-4" /> },
]

const SIDEBAR_BG = '#1B4F72'

function NavItemLink({ item, depth = 0 }: { item: NavItem; depth?: number }) {
  const location = useLocation()
  const [open, setOpen] = useState(() => {
    if (!item.children) return false
    return item.children.some((c) => c.path && location.pathname.startsWith(c.path))
  })

  const indent = depth > 0 ? 'pl-8' : 'pl-3'

  if (item.children) {
    return (
      <div>
        <button
          onClick={() => setOpen((v) => !v)}
          className={`flex w-full items-center gap-2.5 rounded-md ${indent} pr-3 py-2 text-sm text-blue-100 hover:bg-white/10 transition-colors`}
        >
          <span className="opacity-70">{item.icon}</span>
          <span className="flex-1 text-left font-medium">{item.label}</span>
          {open
            ? <ChevronDown className="h-3.5 w-3.5 opacity-60" />
            : <ChevronRight className="h-3.5 w-3.5 opacity-60" />}
        </button>
        {open && (
          <div className="mt-0.5">
            {item.children.map((child) => (
              <NavItemLink key={child.path ?? child.label} item={child} depth={depth + 1} />
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <NavLink
      to={item.path!}
      end={item.path === '/'}
      className={({ isActive }) =>
        `flex items-center gap-2.5 rounded-md ${indent} pr-3 py-2 text-sm transition-colors ` +
        (isActive
          ? 'bg-white/20 text-white font-semibold'
          : 'text-blue-100 hover:bg-white/10')
      }
    >
      <span className="opacity-70">{item.icon}</span>
      <span>{item.label}</span>
    </NavLink>
  )
}

export function Sidebar() {
  return (
    <aside
      className="flex h-screen w-60 flex-shrink-0 flex-col"
      style={{ backgroundColor: SIDEBAR_BG }}
    >
      {/* Logo */}
      <div className="flex h-16 items-center gap-2 border-b border-white/10 px-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/20">
          <Car className="h-5 w-5 text-white" />
        </div>
        <div>
          <p className="text-sm font-bold text-white leading-tight">VehicleFinance</p>
          <p className="text-[10px] text-blue-300 uppercase tracking-wider">Operations Portal</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-0.5">
        {navItems.map((item) => (
          <NavItemLink key={item.path ?? item.label} item={item} />
        ))}
      </nav>

      {/* Footer */}
      <div className="border-t border-white/10 px-4 py-3">
        <p className="text-xs text-blue-300">VehicleFinance Ops v1.0</p>
      </div>
    </aside>
  )
}
