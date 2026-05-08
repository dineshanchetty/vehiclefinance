import { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, FileText, ChevronDown, ClipboardList,
  Camera, Calculator, Wrench, FileSignature, CheckSquare, Car,
  AlertCircle, ScrollText, Search, Users, Sparkles,
} from 'lucide-react'
import { useSession } from '../lib/auth'

/**
 * Sidebar — grouped navigation with section headings, search, and a
 * profile footer. Uses a layered indigo dark palette with a left accent
 * stripe on the active item for clearer visual hierarchy than a flat list.
 */

interface NavItem {
  label: string
  path?: string
  icon: React.ReactNode
  badge?: string | number
  children?: NavItem[]
}

interface NavGroup {
  heading: string
  items: NavItem[]
}

const queueItems: NavItem[] = [
  { label: 'Doc Review',    path: '/queue/Q_BUYER_DOC_REVIEW',     icon: <FileText className="h-4 w-4" /> },
  { label: 'Photo Review',  path: '/queue/Q_SELLER_PHOTO_REVIEW',  icon: <Camera className="h-4 w-4" /> },
  { label: 'F&I Review',    path: '/queue/Q_FNI_REVIEW',           icon: <Search className="h-4 w-4" /> },
  { label: 'Quote Prep',    path: '/queue/Q_FNI_QUOTE_PREP',       icon: <Calculator className="h-4 w-4" /> },
  { label: 'Inspections',   path: '/queue/Q_HARTCON_INSPECTION',   icon: <Wrench className="h-4 w-4" /> },
  { label: 'Contracts',     path: '/queue/Q_SELLER_CONTRACT',      icon: <FileSignature className="h-4 w-4" /> },
  { label: 'Approvals',     path: '/queue/Q_DEAL_APPROVAL',        icon: <CheckSquare className="h-4 w-4" /> },
  { label: 'NATIS',         path: '/queue/Q_NATIS_FULFILMENT',     icon: <Car className="h-4 w-4" /> },
  { label: 'Escalations',   path: '/queue/Q_HUMAN_ESCALATION',     icon: <AlertCircle className="h-4 w-4" /> },
]

const navGroups: NavGroup[] = [
  {
    heading: 'Workspace',
    items: [
      { label: 'Dashboard', path: '/',      icon: <LayoutDashboard className="h-4 w-4" /> },
      { label: 'Deals',     path: '/deals', icon: <Users className="h-4 w-4" /> },
    ],
  },
  {
    heading: 'Operations',
    items: [
      { label: 'Queues', icon: <ClipboardList className="h-4 w-4" />, children: queueItems },
    ],
  },
  {
    heading: 'Insights',
    items: [
      { label: 'Audit Log', path: '/audit', icon: <ScrollText className="h-4 w-4" /> },
    ],
  },
]

// Layered indigo palette — solid base with a subtle gradient sheen.
const SIDEBAR_STYLE: React.CSSProperties = {
  background: 'linear-gradient(180deg, #1e1b4b 0%, #1a173f 100%)',
}

function NavItemLink({ item, depth = 0 }: { item: NavItem; depth?: number }) {
  const location = useLocation()
  const [open, setOpen] = useState(() => {
    if (!item.children) return false
    return item.children.some((c) => c.path && location.pathname.startsWith(c.path))
  })

  if (item.children) {
    const anyChildActive = item.children.some((c) => c.path && location.pathname.startsWith(c.path))
    return (
      <div className="space-y-0.5">
        <button
          onClick={() => setOpen((v) => !v)}
          className={`group flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors ${
            anyChildActive
              ? 'text-white bg-white/[0.06]'
              : 'text-indigo-100/80 hover:text-white hover:bg-white/[0.06]'
          }`}
        >
          <span className={anyChildActive ? 'text-indigo-300' : 'text-indigo-300/60 group-hover:text-indigo-200'}>
            {item.icon}
          </span>
          <span className="flex-1 text-left">{item.label}</span>
          <span className={`transition-transform ${open ? 'rotate-0' : '-rotate-90'} text-indigo-300/60`}>
            <ChevronDown className="h-3.5 w-3.5" />
          </span>
        </button>
        {open && (
          <div className="ml-3.5 border-l border-white/10 pl-2 space-y-0.5">
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
        `group relative flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors ` +
        (isActive
          ? 'bg-white/10 text-white font-semibold'
          : 'text-indigo-100/70 hover:text-white hover:bg-white/[0.06]')
      }
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-r bg-indigo-300" aria-hidden />
          )}
          <span className={isActive ? 'text-indigo-200' : 'text-indigo-300/60 group-hover:text-indigo-200'}>
            {item.icon}
          </span>
          <span className="flex-1">{item.label}</span>
          {item.badge != null && (
            <span className="rounded-full bg-indigo-500/30 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-100">
              {item.badge}
            </span>
          )}
        </>
      )}
    </NavLink>
  )
}

function GroupHeading({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-2.5 mb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-indigo-300/60">
      {children}
    </p>
  )
}

export function Sidebar() {
  const [filter, setFilter] = useState('')
  const session = useSession()

  // Filter nav items by the search box. We never hide a parent group entirely
  // unless every item misses the filter.
  const matches = (label: string) => label.toLowerCase().includes(filter.toLowerCase())
  const filteredGroups = filter
    ? navGroups
        .map((g) => ({
          ...g,
          items: g.items
            .map((it) =>
              it.children
                ? { ...it, children: it.children.filter((c) => matches(c.label)) }
                : it,
            )
            .filter((it) => matches(it.label) || (it.children && it.children.length > 0)),
        }))
        .filter((g) => g.items.length > 0)
    : navGroups

  const userInitials = (session.profile?.full_name ?? session.user?.email ?? '?')
    .split(/\s+|@/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? '')
    .join('') || '?'

  return (
    <aside
      className="flex h-screen w-64 flex-shrink-0 flex-col text-indigo-100"
      style={SIDEBAR_STYLE}
    >
      {/* Brand */}
      <div className="flex items-center gap-2.5 px-4 pt-4 pb-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-indigo-700 shadow-lg shadow-indigo-900/40">
          <Sparkles className="h-4 w-4 text-white" />
        </div>
        <div>
          <p className="text-sm font-bold text-white leading-tight">VehicleFinance</p>
          <p className="text-[10px] text-indigo-300/70 uppercase tracking-wider">Operations Portal</p>
        </div>
      </div>

      {/* Search */}
      <div className="px-3 pb-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-indigo-300/60" />
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Search…"
            className="w-full rounded-lg bg-white/5 border border-white/10 pl-7 pr-3 py-1.5 text-xs text-white placeholder-indigo-300/50 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400 transition-colors"
          />
        </div>
      </div>

      {/* Grouped nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-1 space-y-4">
        {filteredGroups.length === 0 && (
          <p className="px-2.5 text-xs italic text-indigo-300/50">No matches.</p>
        )}
        {filteredGroups.map((group) => (
          <div key={group.heading}>
            <GroupHeading>{group.heading}</GroupHeading>
            <div className="space-y-0.5">
              {group.items.map((item) => (
                <NavItemLink key={item.path ?? item.label} item={item} />
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* Profile footer */}
      <div className="border-t border-white/10 px-3 py-3">
        <div className="flex items-center gap-2.5 rounded-lg px-1.5 py-1.5 hover:bg-white/[0.06] transition-colors">
          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-400 to-indigo-700 text-xs font-bold text-white">
            {userInitials}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold text-white">
              {session.profile?.full_name ?? session.user?.email ?? 'Signed out'}
            </p>
            <p className="truncate text-[10px] text-indigo-300/70 uppercase tracking-wide">
              {session.profile?.role ?? 'Guest'}
            </p>
          </div>
        </div>
        <p className="mt-2 px-2 text-[10px] text-indigo-300/40">v1.0 · ops portal</p>
      </div>
    </aside>
  )
}
