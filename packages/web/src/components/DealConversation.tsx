/**
 * DealConversation — live WhatsApp conversation viewer + ops compose box.
 *
 * Renders the per-deal conversation between the bot and the customer (and
 * any seller, if present), plus a compose textarea that lets ops take over
 * and send a WhatsApp message directly through the bot's number.
 *
 * Realtime: subscribes to INSERTs on `conversation_messages` filtered by the
 * phone(s) associated with the deal. Uses a bespoke channel here (not
 * `useRealtimeTable`) because we need a `phone=in.(...)` filter to cover
 * buyer + seller in a single subscription.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { format, formatDistanceToNow } from 'date-fns'
import { Send, MessageSquare, Bot, User, Paperclip, Loader2, AlertCircle } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useProfile } from '../lib/auth'
import type { ConversationMessage } from '../types/database'

const BOT_API_URL = (import.meta.env.VITE_BOT_API_URL as string | undefined) ?? 'http://localhost:3001'

interface DealConversationProps {
  dealId: string
}

interface PartyPhone {
  party: 'BUYER' | 'SELLER'
  name: string
  phone: string
}

const MEDIA_PLACEHOLDER_RE = /^\[(?:User sent a |)(?:document|photo|image|video|audio)[^\]]*\]$/i

export function DealConversation({ dealId }: DealConversationProps) {
  const profile = useProfile()
  const [parties, setParties] = useState<PartyPhone[]>([])
  const [messages, setMessages] = useState<ConversationMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [connected, setConnected] = useState(false)

  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const [targetPhone, setTargetPhone] = useState<string>('')

  const scrollRef = useRef<HTMLDivElement | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  const phones = useMemo(() => parties.map((p) => p.phone).filter(Boolean), [parties])

  // ── 1. Load buyer/seller phones ───────────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      const [{ data: buyers }, { data: sellers }] = await Promise.all([
        supabase.from('buyers').select('phone, full_name').eq('deal_id', dealId),
        supabase.from('sellers').select('phone, full_name').eq('deal_id', dealId),
      ])
      if (cancelled) return
      const ps: PartyPhone[] = []
      for (const b of buyers ?? []) {
        if (b.phone) ps.push({ party: 'BUYER', name: b.full_name ?? 'Buyer', phone: b.phone })
      }
      for (const s of sellers ?? []) {
        if (s.phone) ps.push({ party: 'SELLER', name: s.full_name ?? 'Seller', phone: s.phone })
      }
      setParties(ps)
      const buyer = ps.find((p) => p.party === 'BUYER')
      setTargetPhone((buyer ?? ps[0])?.phone ?? '')
    }
    load().catch((e) => setError(e instanceof Error ? e.message : 'Failed to load parties'))
    return () => {
      cancelled = true
    }
  }, [dealId])

  // ── 2. Load history + subscribe to inserts ────────────────────────────────
  useEffect(() => {
    if (phones.length === 0) {
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)

    const fetchHistory = async () => {
      const { data, error: histErr } = await supabase
        .from('conversation_messages')
        .select('*')
        .in('phone', phones)
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

    // Bespoke realtime channel — `useRealtimeTable` only supports eq filters.
    const filter = `phone=in.(${phones.map((p) => `"${p}"`).join(',')})`
    const channel = supabase
      .channel(`deal-conv-${dealId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'conversation_messages', filter },
        (payload: { new: unknown }) => {
          const row = payload.new as ConversationMessage
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
  }, [dealId, phones.join('|')]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── 3. Auto-scroll only if user is already near bottom ────────────────────
  const lastMsgId = messages[messages.length - 1]?.id
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    if (distanceFromBottom < 120) {
      el.scrollTop = el.scrollHeight
    }
  }, [lastMsgId])

  // Initial scroll-to-bottom once history lands
  useEffect(() => {
    if (!loading && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [loading])

  // ── 4. Auto-grow textarea ─────────────────────────────────────────────────
  useEffect(() => {
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = 'auto'
    const lineHeight = 20
    const maxHeight = lineHeight * 5 + 16
    ta.style.height = `${Math.min(ta.scrollHeight, maxHeight)}px`
  }, [draft])

  // ── 5. Send handler ───────────────────────────────────────────────────────
  const handleSend = useCallback(async () => {
    const text = draft.trim()
    if (!text || sending || !targetPhone) return
    setSending(true)
    setSendError(null)
    try {
      const res = await fetch(`${BOT_API_URL}/api/ops-send-message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: targetPhone,
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
  }, [draft, sending, targetPhone, profile?.id, dealId])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      void handleSend()
    }
  }

  return (
    <div className="flex h-full max-h-[calc(100vh-220px)] flex-col rounded-xl border border-gray-200 bg-white">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-gray-500" />
          <h3 className="text-sm font-semibold text-gray-700">WhatsApp conversation</h3>
          <span className="text-xs text-gray-400">
            {parties.length === 0
              ? '— no phone on file'
              : parties.map((p) => `${p.party.toLowerCase()}: ${p.phone}`).join(' · ')}
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-gray-400">
          <span className={`h-2 w-2 rounded-full ${connected ? 'bg-green-500' : 'bg-gray-300'}`} />
          {connected ? 'live' : 'connecting…'}
        </div>
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
        {!loading && !error && messages.length === 0 && (
          <div className="flex h-full items-center justify-center text-center">
            <p className="max-w-xs text-sm text-gray-400">
              No messages yet — the customer will start the conversation by texting the bot.
            </p>
          </div>
        )}
        <div className="space-y-2">
          {messages.map((msg) => (
            <MessageBubble key={msg.id} msg={msg} />
          ))}
        </div>
      </div>

      {/* Compose box */}
      <div className="border-t border-gray-200 bg-white px-4 py-3">
        <div className="mb-2 rounded-md bg-amber-50 border border-amber-200 px-2.5 py-1.5 text-[11px] text-amber-800">
          ⚠ Sending here delivers a message to the customer's WhatsApp from the bot's number. Use sparingly — the agent normally handles this.
        </div>

        {parties.length > 1 && (
          <div className="mb-2 flex items-center gap-2 text-xs text-gray-500">
            <label htmlFor="recipient">Send to:</label>
            <select
              id="recipient"
              value={targetPhone}
              onChange={(e) => setTargetPhone(e.target.value)}
              className="rounded border border-gray-200 bg-white px-2 py-1 text-xs"
            >
              {parties.map((p) => (
                <option key={p.phone} value={p.phone}>
                  {p.party === 'BUYER' ? 'Buyer' : 'Seller'} — {p.name} ({p.phone})
                </option>
              ))}
            </select>
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
            className="min-h-[36px] flex-1 resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none disabled:opacity-50"
            disabled={sending || !targetPhone}
          />
          <button
            type="button"
            onClick={() => void handleSend()}
            disabled={sending || !draft.trim() || !targetPhone}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300"
            title="Cmd/Ctrl+Enter to send"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Send
          </button>
        </div>

        {sendError && (
          <div className="mt-2 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs text-red-700">
            <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" /> {sendError}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Message bubble ────────────────────────────────────────────────────────────

function MessageBubble({ msg }: { msg: ConversationMessage }) {
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
      ? 'bg-blue-50 border-blue-200 text-gray-900'
      : isAssistant
        ? 'bg-white border-gray-200 text-gray-900'
        : 'bg-amber-50 border-amber-200 text-gray-700'

  return (
    <div className={`flex flex-col ${align}`}>
      {!isUser && (
        <div className="mb-0.5 flex items-center gap-1 px-1 text-[10px] font-medium text-gray-500">
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
        </div>
      )}
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
