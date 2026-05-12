/**
 * DealConversation — live WhatsApp conversation viewer + ops compose box.
 *
 * Shows BOTH the buyer's and seller's WhatsApp threads for a deal, split
 * into tabs:
 *   • Buyer  · {first_name}     — buyer-side messages (default)
 *   • Seller · {first_name}     — seller-side messages (hidden if no seller)
 *   • Both                       — interleaved timeline of all messages
 *
 * Realtime: ONE channel filtered by `deal_id=eq.<dealId>` covers both
 * parties — switching tabs does not re-subscribe. Per-tab views are derived
 * by filtering the in-memory message list by `party_type` (with a phone
 * fallback for legacy rows that pre-date the party_type column being set).
 *
 * Compose box sends to the active tab's phone. The "Both" tab disables the
 * compose box (ops must pick a recipient).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { format, formatDistanceToNow } from 'date-fns'
import { Send, MessageSquare, Bot, User, Paperclip, Loader2, AlertCircle } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useProfile } from '../lib/auth'
import { getDealParties, type DealParties, type DealPartyInfo } from '../lib/queries'
import type { ConversationMessage } from '../types/database'

const BOT_API_URL = (import.meta.env.VITE_BOT_API_URL as string | undefined) ?? 'http://localhost:3001'

interface DealConversationProps {
  dealId: string
}

type TabKey = 'buyer' | 'seller' | 'both'

const MEDIA_PLACEHOLDER_RE = /^\[(?:User sent a |)(?:document|photo|image|video|audio)[^\]]*\]$/i

function firstName(name: string | undefined | null): string {
  if (!name) return ''
  const trimmed = name.trim()
  if (!trimmed) return ''
  return trimmed.split(/\s+/)[0]
}

/**
 * Classify a message into a party. Prefers the explicit `party_type` column;
 * falls back to phone match against the buyer/seller phones we know about.
 * Returns null if we can't tell (very old rows with no deal context).
 */
function classifyMessage(
  msg: ConversationMessage,
  parties: DealParties,
): 'buyer' | 'seller' | null {
  const pt = (msg.party_type ?? '').toLowerCase()
  if (pt === 'buyer' || pt === 'seller') return pt
  if (parties.buyer && msg.phone === parties.buyer.phone) return 'buyer'
  if (parties.seller && msg.phone === parties.seller.phone) return 'seller'
  return null
}

export function DealConversation({ dealId }: DealConversationProps) {
  const profile = useProfile()
  const [parties, setParties] = useState<DealParties>({ buyer: null, seller: null })
  const [partiesLoaded, setPartiesLoaded] = useState(false)
  const [messages, setMessages] = useState<ConversationMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [connected, setConnected] = useState(false)

  const [activeTab, setActiveTab] = useState<TabKey>('buyer')
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)

  // Track the last-seen message id per tab so we can show an "unread" dot on
  // tabs the user hasn't looked at since a new message arrived.
  const [seenLastIdByTab, setSeenLastIdByTab] = useState<Record<TabKey, string | null>>({
    buyer: null,
    seller: null,
    both: null,
  })

  const scrollRef = useRef<HTMLDivElement | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  // ── 1. Load buyer/seller phones ───────────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    setPartiesLoaded(false)
    getDealParties(dealId)
      .then((p) => {
        if (cancelled) return
        setParties(p)
        setPartiesLoaded(true)
        // Default to buyer if present, otherwise seller, otherwise both.
        if (p.buyer) setActiveTab('buyer')
        else if (p.seller) setActiveTab('seller')
        else setActiveTab('both')
      })
      .catch((e) => {
        if (cancelled) return
        setError(e instanceof Error ? e.message : 'Failed to load parties')
        setPartiesLoaded(true)
      })
    return () => {
      cancelled = true
    }
  }, [dealId])

  // ── 2. Load history + subscribe to inserts ────────────────────────────────
  // The bot historically saves messages with `deal_id = NULL` (only `phone`
  // is set). Filtering by deal_id alone misses everything. Solution: fetch
  // all rows whose phone matches either party, and subscribe to inserts on
  // those phones too. Once parties are known we kick off the load.
  const buyerPhone  = parties.buyer?.phone  ?? null
  const sellerPhone = parties.seller?.phone ?? null

  useEffect(() => {
    if (!buyerPhone && !sellerPhone) return // wait until parties resolve
    let cancelled = false
    setLoading(true)
    setError(null)

    const phones = [buyerPhone, sellerPhone].filter(Boolean) as string[]

    const fetchHistory = async () => {
      // Pull rows matching either deal_id OR any of the party phones (covers
      // legacy null-deal_id rows). PostgREST `or=` syntax.
      const phoneFilter = phones.length > 0 ? `phone.in.(${phones.join(',')})` : ''
      const orFilter = [
        `deal_id.eq.${dealId}`,
        phoneFilter,
      ].filter(Boolean).join(',')
      const { data, error: histErr } = await supabase
        .from('conversation_messages')
        .select('*')
        .or(orFilter)
        .order('created_at', { ascending: true })
        .limit(500)
      if (cancelled) return
      if (histErr) {
        setError(histErr.message)
      } else {
        setMessages((data ?? []) as ConversationMessage[])
      }
      setLoading(false)
    }
    fetchHistory()

    // Realtime: subscribe to ALL inserts on conversation_messages, then
    // filter client-side. Supabase `or=` filters aren't supported in
    // postgres_changes, and we need to catch rows with NULL deal_id whose
    // phone matches either party.
    const channel = supabase
      .channel(`deal-conv-${dealId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'conversation_messages' },
        (payload: { new: unknown }) => {
          const row = payload.new as ConversationMessage
          const matches =
            row.deal_id === dealId ||
            (row.phone && phones.includes(row.phone))
          if (!matches) return
          setMessages((prev) => {
            if (prev.some((m) => m.id === row.id)) return prev
            return [...prev, row]
          })
        },
      )
      .subscribe((status) => {
        setConnected(status === 'SUBSCRIBED')
      })

    return () => {
      cancelled = true
      supabase.removeChannel(channel)
    }
  }, [dealId, buyerPhone, sellerPhone])

  // ── 3. Derive per-tab message lists ───────────────────────────────────────
  const { buyerMsgs, sellerMsgs, bothMsgs } = useMemo(() => {
    const sorted = [...messages].sort((a, b) => {
      const at = a.created_at ?? ''
      const bt = b.created_at ?? ''
      return at < bt ? -1 : at > bt ? 1 : 0
    })
    const buyer: ConversationMessage[] = []
    const seller: ConversationMessage[] = []
    for (const m of sorted) {
      const p = classifyMessage(m, parties)
      if (p === 'buyer') buyer.push(m)
      else if (p === 'seller') seller.push(m)
    }
    return { buyerMsgs: buyer, sellerMsgs: seller, bothMsgs: sorted }
  }, [messages, parties])

  const visibleMessages =
    activeTab === 'buyer' ? buyerMsgs : activeTab === 'seller' ? sellerMsgs : bothMsgs

  // Last message id per tab (for unread detection + scroll trigger).
  const lastIdByTab = useMemo<Record<TabKey, string | null>>(
    () => ({
      buyer: buyerMsgs[buyerMsgs.length - 1]?.id ?? null,
      seller: sellerMsgs[sellerMsgs.length - 1]?.id ?? null,
      both: bothMsgs[bothMsgs.length - 1]?.id ?? null,
    }),
    [buyerMsgs, sellerMsgs, bothMsgs],
  )

  const sellerAvailable = !!parties.seller

  // ── 4. Auto-scroll only if user is already near bottom ────────────────────
  const visibleLastId = lastIdByTab[activeTab]
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    if (distanceFromBottom < 120) {
      el.scrollTop = el.scrollHeight
    }
  }, [visibleLastId])

  // Initial scroll-to-bottom once history lands or tab changes
  useEffect(() => {
    if (!loading && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [loading, activeTab])

  // ── 5. Mark active tab as "seen" whenever its tail moves ──────────────────
  useEffect(() => {
    if (visibleLastId == null) return
    setSeenLastIdByTab((prev) =>
      prev[activeTab] === visibleLastId ? prev : { ...prev, [activeTab]: visibleLastId },
    )
  }, [activeTab, visibleLastId])

  // ── 6. Auto-grow textarea ─────────────────────────────────────────────────
  useEffect(() => {
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = 'auto'
    const lineHeight = 20
    const maxHeight = lineHeight * 5 + 16
    ta.style.height = `${Math.min(ta.scrollHeight, maxHeight)}px`
  }, [draft])

  // ── 7. Resolve compose target from active tab ─────────────────────────────
  const composeTarget: DealPartyInfo | null = useMemo(() => {
    if (activeTab === 'buyer') return parties.buyer
    if (activeTab === 'seller') return parties.seller
    return null // "Both" tab — ops must pick a single thread to reply
  }, [activeTab, parties])

  // ── 8. Send handler ───────────────────────────────────────────────────────
  const handleSend = useCallback(async () => {
    const text = draft.trim()
    if (!text || sending || !composeTarget?.phone) return
    setSending(true)
    setSendError(null)
    try {
      const res = await fetch(`${BOT_API_URL}/api/ops-send-message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: composeTarget.phone,
          message: text,
          ops_user_id: profile?.id,
          deal_id: dealId,
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `Request failed: ${res.status}`)
      }
      setDraft('')
    } catch (err) {
      setSendError(err instanceof Error ? err.message : 'Failed to send message')
    } finally {
      setSending(false)
    }
  }, [draft, sending, composeTarget, profile?.id, dealId])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      void handleSend()
    }
  }

  // Unread = there's a newer message in the (non-active) tab than what the
  // user last viewed there.
  const tabHasUnread = (tab: TabKey): boolean => {
    if (tab === activeTab) return false
    const last = lastIdByTab[tab]
    return !!last && seenLastIdByTab[tab] !== last
  }

  const buyerLabel = parties.buyer ? `Buyer · ${firstName(parties.buyer.name) || 'Buyer'}` : 'Buyer'
  const sellerLabel = parties.seller
    ? `Seller · ${firstName(parties.seller.name) || 'Seller'}`
    : 'Seller'

  return (
    <div className="flex h-full max-h-[calc(100vh-220px)] flex-col rounded-xl border border-gray-200 bg-white">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-gray-500" />
          <h3 className="text-sm font-semibold text-gray-700">WhatsApp conversation</h3>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-gray-400">
          <span className={`h-2 w-2 rounded-full ${connected ? 'bg-green-500' : 'bg-gray-300'}`} />
          {connected ? 'live' : 'connecting…'}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-gray-200 bg-gray-50 px-2 pt-2">
        <TabButton
          active={activeTab === 'buyer'}
          disabled={!parties.buyer}
          unread={tabHasUnread('buyer')}
          onClick={() => setActiveTab('buyer')}
        >
          {buyerLabel}
        </TabButton>
        <TabButton
          active={activeTab === 'seller'}
          disabled={!sellerAvailable}
          unread={tabHasUnread('seller')}
          onClick={() => setActiveTab('seller')}
          title={sellerAvailable ? undefined : 'Seller not yet notified'}
        >
          {sellerLabel}
        </TabButton>
        <TabButton
          active={activeTab === 'both'}
          unread={tabHasUnread('both')}
          onClick={() => setActiveTab('both')}
        >
          Both
        </TabButton>
        {!sellerAvailable && partiesLoaded && (
          <span className="ml-2 self-center text-[11px] text-gray-400">Seller not yet notified</span>
        )}
      </div>

      {/* Message list */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto bg-gray-50 px-4 py-3">
        {loading && (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-gray-400">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading conversation…
          </div>
        )}
        {error && !loading && (
          <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            <AlertCircle className="h-4 w-4" /> {error}
          </div>
        )}
        {!loading && !error && visibleMessages.length === 0 && (
          <div className="flex h-full items-center justify-center text-center">
            <p className="max-w-xs text-sm text-gray-400">
              {activeTab === 'seller' && !sellerAvailable
                ? 'Seller has not been notified yet — no messages to show.'
                : 'No messages yet — the customer will start the conversation by texting the bot.'}
            </p>
          </div>
        )}
        <div className="space-y-2">
          {visibleMessages.map((msg) => (
            <MessageBubble
              key={msg.id}
              msg={msg}
              showPartyChip={activeTab === 'both'}
              party={classifyMessage(msg, parties)}
            />
          ))}
        </div>
      </div>

      {/* Compose box */}
      <div className="border-t border-gray-200 bg-white px-4 py-3">
        <div className="mb-2 rounded-md bg-amber-50 border border-amber-200 px-2.5 py-1.5 text-[11px] text-amber-800">
          ⚠ Sending here delivers a message to the recipient's WhatsApp from the bot's number. Use sparingly — the agent normally handles this.
        </div>

        {activeTab === 'both' ? (
          <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-500">
            Pick the Buyer or Seller tab to reply — the merged view is read-only.
          </div>
        ) : (
          <>
            {composeTarget && (
              <div className="mb-1 text-[11px] text-gray-500">
                Sending to {activeTab === 'buyer' ? 'Buyer' : 'Seller'} — {composeTarget.name} (
                {composeTarget.phone})
              </div>
            )}
            <div className="flex items-end gap-2">
              <textarea
                ref={textareaRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Send a WhatsApp message…"
                rows={1}
                className="min-h-[36px] flex-1 resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-wesbank-navy focus:outline-none disabled:opacity-50"
                disabled={sending || !composeTarget?.phone}
              />
              <button
                type="button"
                onClick={() => void handleSend()}
                disabled={sending || !draft.trim() || !composeTarget?.phone}
                className="inline-flex items-center gap-1.5 rounded-lg bg-wesbank-navy px-3 py-2 text-sm font-medium text-white hover:bg-wesbank-navy-dark disabled:cursor-not-allowed disabled:bg-gray-300"
                title="Cmd/Ctrl+Enter to send"
              >
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Send
              </button>
            </div>
          </>
        )}

        {sendError && (
          <div className="mt-2 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs text-red-700">
            <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" /> {sendError}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Tab button ────────────────────────────────────────────────────────────────

function TabButton({
  active,
  disabled,
  unread,
  onClick,
  children,
  title,
}: {
  active: boolean
  disabled?: boolean
  unread?: boolean
  onClick: () => void
  children: React.ReactNode
  title?: string
}) {
  if (disabled) {
    return (
      <span
        title={title}
        className="cursor-not-allowed rounded-t-md px-3 py-1.5 text-xs font-medium text-gray-300"
      >
        {children}
      </span>
    )
  }
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`relative rounded-t-md px-3 py-1.5 text-xs font-medium transition ${
        active
          ? 'border border-b-0 border-gray-200 bg-white text-gray-900'
          : 'text-gray-500 hover:text-gray-700'
      }`}
    >
      {children}
      {unread && (
        <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-wesbank-navy align-middle" />
      )}
    </button>
  )
}

// ── Message bubble ────────────────────────────────────────────────────────────

function MessageBubble({
  msg,
  showPartyChip,
  party,
}: {
  msg: ConversationMessage
  showPartyChip?: boolean
  party?: 'buyer' | 'seller' | null
}) {
  const meta = (msg.tool_use as { sent_by_ops?: boolean; ops_user_id?: string } | null) ?? null
  const opsSent = meta?.sent_by_ops === true
  const isUser = msg.role === 'user'
  const isAssistant = msg.role === 'assistant'

  const content = msg.content ?? ''
  const isMedia = MEDIA_PLACEHOLDER_RE.test(content.trim())
  const created = msg.created_at ? new Date(msg.created_at) : null
  const relative = created ? formatDistanceToNow(created, { addSuffix: true }) : ''
  const fullStamp = created ? format(created, 'dd MMM yyyy HH:mm:ss') : ''

  const align = isUser ? 'items-end' : 'items-start'
  const bubbleColor = isUser
    ? 'bg-emerald-100 border-emerald-200 text-gray-900'
    : opsSent
      ? 'bg-wesbank-navy/5 border-wesbank-navy/20 text-gray-900'
      : isAssistant
        ? 'bg-white border-gray-200 text-gray-900'
        : 'bg-amber-50 border-amber-200 text-gray-700'

  const partyChipColor =
    party === 'seller'
      ? 'bg-purple-50 border-purple-200 text-purple-700'
      : party === 'buyer'
        ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
        : 'bg-gray-100 border-gray-200 text-gray-500'
  const partyChipLabel = party === 'seller' ? 'Seller' : party === 'buyer' ? 'Buyer' : '—'

  return (
    <div className={`flex flex-col ${align}`}>
      <div className="mb-0.5 flex items-center gap-1.5 px-1 text-[10px] font-medium text-gray-500">
        {showPartyChip && (
          <span className={`rounded-full border px-1.5 py-0.5 text-[9px] font-semibold ${partyChipColor}`}>
            {partyChipLabel}
          </span>
        )}
        {!isUser && (
          <>
            {opsSent ? (
              <>
                <User className="h-3 w-3" /> Ops{meta?.ops_user_id ? ` · ${meta.ops_user_id.slice(0, 8)}` : ''}
              </>
            ) : isAssistant ? (
              <>
                <Bot className="h-3 w-3" /> Bot
              </>
            ) : (
              <span>System</span>
            )}
          </>
        )}
      </div>
      <div
        title={fullStamp}
        className={`max-w-[70%] whitespace-pre-wrap break-words rounded-lg border px-3 py-2 text-sm shadow-sm ${bubbleColor}`}
      >
        {isMedia ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 border border-gray-200 px-2 py-0.5 text-xs text-gray-700">
            <Paperclip className="h-3 w-3" /> Document / media
          </span>
        ) : (
          content
        )}
      </div>
      <span title={fullStamp} className="mt-0.5 px-1 text-[10px] text-gray-400">
        {relative}
      </span>
    </div>
  )
}
