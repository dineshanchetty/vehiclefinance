import { useState } from 'react'

/**
 * SubTabs — horizontal sub-navigation used inside dedicated tab pages
 * (Buyer / Seller / Vehicle / Quote / Contracts / Tasks / Affordability).
 *
 * Each pane has an optional badge so ops can scan counts ("3 docs",
 * "2/5 done", "5 open") without clicking through.
 */
export interface SubTabPane {
  id: string
  label: string
  icon?: React.ReactNode
  badge?: number | string
  body: React.ReactNode
}

export function SubTabs({
  panes,
  defaultId,
}: {
  panes: SubTabPane[]
  defaultId?: string
}) {
  const [activeId, setActiveId] = useState(defaultId ?? panes[0]?.id ?? '')
  const active = panes.find((p) => p.id === activeId) ?? panes[0]
  if (!active) return null
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-200 bg-white">
        <div className="flex items-center gap-1 px-2 overflow-x-auto">
          {panes.map((p) => {
            const isActive = p.id === activeId
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setActiveId(p.id)}
                className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${
                  isActive
                    ? 'border-indigo-600 text-gray-900'
                    : 'border-transparent text-gray-500 hover:text-gray-800'
                }`}
              >
                {p.icon && <span className={isActive ? 'text-indigo-600' : 'text-gray-400'}>{p.icon}</span>}
                {p.label}
                {p.badge != null && p.badge !== '' && p.badge !== 0 && (
                  <span className={`ml-0.5 inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full px-1.5 text-[10px] font-semibold ${
                    isActive ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-500'
                  }`}>{p.badge}</span>
                )}
              </button>
            )
          })}
        </div>
      </div>
      <div>{active.body}</div>
    </div>
  )
}
