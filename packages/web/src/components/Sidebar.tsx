import { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import {
  ChevronDown, ScrollText, Search, Sparkles, RotateCcw, BarChart3,
} from 'lucide-react'
import { useSession } from '../lib/auth'

/**
 * Sidebar — quieter, denser nav. Claimtec navy backdrop with a yellow
 * left-stripe accent on the active item. Group headings are small and
 * tracked; the Queues group is collapsible to keep the list short.
 */

interface NavItem {
  label: string
  path?: string
  icon: React.ReactNode
  badge?: string | number
  children?: NavItem[]
  defaultCollapsed?: boolean
}

interface NavGroup {
  heading: string
  items: NavItem[]
}

// This app is now the recovery platform. Origination (Deals, Queues, doc/photo
// review) is handled in Absa's own systems and has been retired from the nav.
const navGroups: NavGroup[] = [
  {
    heading: 'Workspace',
    items: [
      { label: 'Recovery',  path: '/recovery', icon: <RotateCcw className="h-4 w-4" /> },
    ],
  },
  {
    heading: 'Insights',
    items: [
      { label: 'Reports',   path: '/reports', icon: <BarChart3 className="h-4 w-4" /> },
      { label: 'Audit Log', path: '/audit',   icon: <ScrollText className="h-4 w-4" /> },
    ],
  },
]

// Claimtec navy backdrop — gradient from navy-darker to deeper navy.
const SIDEBAR_STYLE: React.CSSProperties = {
  background: 'linear-gradient(180deg, #001A3D 0%, #00102B 100%)',
}

function NavItemLink({ item, depth = 0 }: { item: NavItem; depth?: number }) {
  const location = useLocation()
  const [open, setOpen] = useState(() => {
    if (!item.children) return false
    const anyActive = item.children.some((c) => c.path && location.pathname.startsWith(c.path))
    if (anyActive) return true
    return !item.defaultCollapsed
  })

  if (item.children) {
    const anyChildActive = item.children.some((c) => c.path && location.pathname.startsWith(c.path))
    return (
      <div>
        <button
          onClick={() => setOpen((v) => !v)}
          className={`group flex h-8 w-full items-center gap-2.5 rounded-md px-2.5 text-sm transition-colors ${
            anyChildActive
              ? 'text-white bg-white/[0.06] font-semibold'
              : 'text-white/70 hover:text-white hover:bg-white/[0.05]'
          }`}
        >
          <span className={anyChildActive ? 'text-claimtec-gold' : 'text-white/50 group-hover:text-white/80'}>
            {item.icon}
          </span>
          <span className="flex-1 text-left">{item.label}</span>
          <span className={`transition-transform ${open ? 'rotate-0' : '-rotate-90'} text-white/40`}>
            <ChevronDown className="h-3.5 w-3.5" />
          </span>
        </button>
        {open && (
          <div className="ml-3.5 mt-0.5 border-l border-white/10 pl-2">
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
        `group relative flex h-8 items-center gap-2.5 rounded-md px-2.5 text-sm transition-colors ` +
        (isActive
          ? 'bg-white/[0.08] text-white font-semibold'
          : 'text-white/70 hover:text-white hover:bg-white/[0.05]')
      }
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-r bg-claimtec-gold" aria-hidden />
          )}
          <span className={isActive ? 'text-claimtec-gold' : 'text-white/50 group-hover:text-white/80'}>
            {item.icon}
          </span>
          <span className="flex-1">{item.label}</span>
          {item.badge != null && (
            <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-[10px] font-semibold text-white">
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
    <p className="px-2.5 mb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/40">
      {children}
    </p>
  )
}

export function Sidebar() {
  const [filter, setFilter] = useState('')
  const session = useSession()

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
      className="flex h-screen w-56 flex-shrink-0 flex-col text-white"
      style={SIDEBAR_STYLE}
    >
      {/* Brand */}
      <div className="flex items-center gap-2 px-3 pt-3 pb-2.5">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-gradient-to-br from-claimtec-forest-2 to-claimtec-forest ring-1 ring-white/10">
          <Sparkles className="h-3.5 w-3.5 text-claimtec-gold" />
        </div>
        <p className="text-xs font-bold text-white leading-tight tracking-tight">
          claim<span className="text-claimtec-red">Tec</span>
          <span className="ml-1 text-[10px] font-normal text-white/50">FinOps</span>
        </p>
      </div>

      {/* Search */}
      <div className="px-3 pb-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white/40" />
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Search…"
            className="w-full rounded-md bg-white/5 border border-white/10 pl-7 pr-2.5 py-1.5 text-xs text-white placeholder-white/40 focus:border-white/30 focus:outline-none focus:ring-0 transition-colors"
          />
        </div>
      </div>

      {/* Grouped nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-1 space-y-3">
        {filteredGroups.length === 0 && (
          <p className="px-2.5 text-xs italic text-white/40">No matches.</p>
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
      <div className="border-t border-white/10 px-3 py-2.5">
        <div
          className="flex items-center gap-2.5 rounded-md px-1.5 py-1 hover:bg-white/[0.05] transition-colors"
          title={`v1.0 · ${session.profile?.role ?? 'guest'}`}
        >
          <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-claimtec-forest to-claimtec-forest-2 text-[10px] font-bold text-white ring-1 ring-white/10">
            {userInitials}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold text-white">
              {session.profile?.full_name ?? session.user?.email ?? 'Signed out'}
            </p>
            <p className="truncate text-[10px] text-white/50 uppercase tracking-wide">
              {session.profile?.role ?? 'Guest'}
            </p>
          </div>
        </div>
      </div>
    </aside>
  )
}
