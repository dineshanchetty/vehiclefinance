// Deno port of packages/bot/src/agent/agent.ts.
//
// Same behaviour: snapshot the deal state into the system prompt, run the
// Anthropic tool-use loop until end_turn or MAX_TOOL_ITERATIONS, persist
// inbound + outbound turns to conversation_messages.

import Anthropic from "https://esm.sh/@anthropic-ai/sdk@0.89.0"
import { BUYER_SYSTEM_PROMPT, SELLER_SYSTEM_PROMPT } from "./system-prompts.ts"
import { AGENT_TOOLS } from "./tool-schemas.ts"
import { TOOL_HANDLERS } from "./tool-handlers.ts"
import {
  loadConversationHistory, saveMessage, buildMessagesArray, pruneOldMessages,
} from "./memory.ts"
import {
  getDealByBuyerPhone, getDealBySellerPhone, getDealById,
} from "./supabase-helpers.ts"
import { sendTextMessage } from "./dialog360.ts"

const MODEL = "claude-sonnet-4-6"
const MAX_TOOL_ITERATIONS = 15

export class VehicleFinanceAgent {
  private client: Anthropic
  constructor() { this.client = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY") }) }

  async processMessage(phone: string, message: string, mediaId?: string): Promise<void> {
    // ── Recovery-mode switch ─────────────────────────────────────────────────
    // Absa now runs origination in its own systems, so the old buyer/seller
    // origination flow (OTP → KYC → affordability) is retired. When BOT_MODE is
    // "recovery" (or "holding"), inbound messages get a single POPIA-aware
    // holding / hand-off reply — the origination tool loop never runs. The full
    // recovery re-engagement (upsell / reactivation) is OUTBOUND and stays gated
    // behind template approval (G2) + consent (G1); it lands in this mode once
    // those clear. Fixed responder → deterministic, no LLM cost, no tool risk.
    const botMode = (Deno.env.get("BOT_MODE") ?? "").toLowerCase()
    if (botMode === "recovery" || botMode === "holding") {
      const holding = Deno.env.get("BOT_HOLDING_MESSAGE") ??
        "Hi 👋 Thanks for your message.\n\n" +
        "Vehicle finance applications are now handled directly by your bank. " +
        "If a recent application of yours was declined, we may reach out with options you could qualify for — there's nothing you need to do right now.\n\n" +
        "You can reply STOP at any time to opt out of contact.\n\n— Claimtec"
      const lower = (message ?? "").trim().toLowerCase()
      if (lower === "stop" || lower === "unsubscribe" || lower === "opt out") {
        await sendTextMessage(phone, "You've been opted out. We won't contact you again. — Claimtec")
        await saveMessage(phone, "user", message, { party_type: "buyer" })
        await saveMessage(phone, "assistant", "[opt-out acknowledged]", { party_type: "buyer" })
        try {
          const { getSupabaseClient } = await import("./supabase.ts")
          await getSupabaseClient().from("decline_leads")
            .update({ recovery_status: "OPTED_OUT" }).eq("phone", phone)
        } catch { /* non-fatal */ }
        return
      }

      await saveMessage(phone, "user", message, { party_type: "buyer" })

      // Recovery re-engagement (inbound): the customer messaged first, opening a
      // 24-hour free-form window — so we may reply with their pre-qualified upsell
      // offer without an approved template. If this number is a priced
      // affordability-decline lead, run the upsell journey; otherwise hold.
      if (botMode === "recovery") {
        try {
          const reply = await this.tryRecoveryOffer(phone, message ?? "")
          if (reply) { await saveMessage(phone, "assistant", reply, { party_type: "buyer" }); return }
        } catch (e) { console.error("[agent] recovery offer failed:", e) }
      }

      await sendTextMessage(phone, holding)
      await saveMessage(phone, "assistant", holding, { party_type: "buyer" })
      return
    }

    const partyType = await this.resolvePartyType(phone)
    const basePrompt = partyType === "seller" ? SELLER_SYSTEM_PROMPT : BUYER_SYSTEM_PROMPT
    const dealId = await this.resolveDealId(phone, partyType)
    const stateSnapshot = await this.buildStateSnapshot(dealId, partyType)
    const systemPrompt = `${basePrompt}

## Conversation context (runtime)

- **The user you are talking to is on WhatsApp at phone: \`${phone}\` (E.164, no leading +).**
- When you call **send_buttons**, **send_list**, or any **send_whatsapp_message** that targets *this same user*, you MUST pass \`phone="${phone}"\`.
- Never pull a phone number out of the user's typed text and use it as the recipient. Numbers the user types (like a local "0821234567") are for your records, not for sending.
- Only use a *different* phone number when explicitly addressing the other party.

${stateSnapshot}
`
    const userContent = mediaId
      ? `${message || ""}[User sent a document/photo — media_id: ${mediaId}]`.trim()
      : message
    await saveMessage(phone, "user", userContent, { party_type: partyType, deal_id: dealId ?? undefined })
    const history = await loadConversationHistory(phone, 29, partyType)
    const messagesArray = buildMessagesArray(history.slice(0, -1), userContent)
    const agentReply = await this.runAgentLoop(systemPrompt, messagesArray, phone)
    if (agentReply) {
      await sendTextMessage(phone, agentReply)
      await saveMessage(phone, "assistant", agentReply, { party_type: partyType, deal_id: dealId ?? undefined })
    }
    await pruneOldMessages(phone, 100).catch(() => {
      console.warn(`[agent] Failed to prune messages for ${phone}`)
    })
  }

  // Recovery re-engagement: if this number is a priced affordability-decline
  // lead, run the upsell journey:
  //   ROUTED/ENGAGING → send offer + vehicle cards            → RE_ENGAGED
  //   RE_ENGAGED      → interpret their reply as a car choice → RETURNED
  // Returns the sent text, or null if this number isn't a live upsell lead
  // (caller then falls back to the holding message).
  private async tryRecoveryOffer(phone: string, inbound: string): Promise<string | null> {
    const { getSupabaseClient } = await import("./supabase.ts")
    const { composeUpsellOffer } = await import("./recovery.ts")
    const supa = getSupabaseClient()

    const { data: lead } = await supa.from("decline_leads")
      .select("id, full_name, vehicle_make, vehicle_model, vehicle_price, qualifying_ceiling, recovery_status")
      .eq("phone", phone)
      .eq("workstream", "A_UPSELL")
      .not("qualifying_ceiling", "is", null)
      .in("recovery_status", ["ROUTED", "ENGAGING", "RE_ENGAGED"])
      .order("created_at", { ascending: false })
      .limit(1).maybeSingle()

    if (!lead) return null

    // Re-engaged: interpret the reply as a vehicle choice against the same
    // listing set we offered (deterministic keyword/ordinal match — no LLM).
    if (lead.recovery_status === "RE_ENGAGED") {
      const { getListingProvider } = await import("./listings.ts")
      const provider = getListingProvider((k) => Deno.env.get(k))
      const listings = (await provider.search({
        make: lead.vehicle_make ?? undefined,
        model: lead.vehicle_model ?? undefined,
        min_price: Math.max(0, Math.floor((lead.qualifying_ceiling as number) * 0.55 / 1000) * 1000),
        max_price: lead.qualifying_ceiling as number,
      })).slice(0, 3)

      const text = (inbound ?? "").toLowerCase()
      let chosen: { title: string; url: string } | null = null

      // Ordinals: "1", "first", "2", "second", …
      const ordinal =
        /\b(1|one|first)\b/.test(text) ? 0 :
        /\b(2|two|second)\b/.test(text) ? 1 :
        /\b(3|three|third)\b/.test(text) ? 2 : -1
      if (ordinal >= 0 && listings[ordinal]) chosen = listings[ordinal]

      // Model/make keywords from the card titles ("golf", "tiguan", "polo"…)
      if (!chosen) {
        for (const l of listings) {
          const tokens = l.title.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length >= 3)
          if (tokens.some((t) => text.includes(t))) { chosen = l; break }
        }
      }

      if (chosen) {
        const first = (lead.full_name ?? "").trim().split(/\s+/)[0] || "there"
        const confirm =
          `Great choice, ${first} — *${chosen.title}* 🎉\n\n` +
          `I'm sending your pre-qualified application for this vehicle back to the bank now. ` +
          `They'll confirm the final approval and be in touch to complete the deal.\n\n` +
          `Nothing more you need to do — we'll keep you posted. ✅`
        await sendTextMessage(phone, confirm)
        // Record the chosen vehicle in raw_payload (read-modify-write; no schema churn).
        const { data: cur } = await supa.from("decline_leads")
          .select("raw_payload").eq("id", lead.id).maybeSingle()
        const payload = { ...(cur?.raw_payload ?? {}), chosen_vehicle: { title: chosen.title, url: chosen.url, chosen_at: new Date().toISOString() } }
        await supa.from("decline_leads").update({
          recovery_status: "RETURNED",
          returned_at: new Date().toISOString(),
          raw_payload: payload,
        }).eq("id", lead.id)
        return confirm
      }

      const nudge =
        "Which one would you like? Reply with the car's name (e.g. *the Golf*) " +
        "or just the number — *1*, *2* or *3* 🚗"
      await sendTextMessage(phone, nudge)
      return nudge
    }

    const offer = composeUpsellOffer({
      fullName: lead.full_name,
      originalPrice: lead.vehicle_price,
      qualifyingCeiling: lead.qualifying_ceiling,
      make: lead.vehicle_make,
      model: lead.vehicle_model,
    })

    // Greeting first…
    await sendTextMessage(phone, offer.message)

    // …then one CTA-URL card per listing — image header when the provider has
    // one (demo/feed adapters), text header otherwise (deeplink). True media
    // carousels are template-only → gate G2.
    try {
      const { sendCtaUrlMessage } = await import("./dialog360.ts")
      const { getListingProvider } = await import("./listings.ts")
      const provider = getListingProvider((k) => Deno.env.get(k))
      const listings = await provider.search(offer.searchParams)
      for (const l of listings.slice(0, 3)) {
        await sendCtaUrlMessage(
          phone,
          `*${l.title}*\n${l.body}`,      // body (title bolded — image headers can't carry text)
          "Browse cars 🚗",               // button
          l.url,
          l.imageUrl ? undefined : l.title, // text header only when no image
          "Claimtec · pre-qualified for you",
          l.imageUrl,
        )
      }
    } catch (e) { console.error("[agent] CTA cards failed:", e) }

    await supa.from("decline_leads").update({ recovery_status: "RE_ENGAGED" }).eq("id", lead.id)
    return offer.message
  }

  private async buildStateSnapshot(
    dealId: string | null, partyType: "buyer" | "seller",
  ): Promise<string> {
    if (!dealId) return ""
    try {
      const deal = await getDealById(dealId)
      if (!deal) return ""
      const d = deal as {
        deal_number?: string
        status?: string
        current_phase?: string
        completed_milestones?: string[]
        buyers?: Array<{ full_name?: string; consent_status?: boolean }>
        sellers?: Array<{ full_name?: string; consent_status?: boolean; bank_account_number?: string | null }>
        vehicles?: Array<{ make?: string; model?: string; year?: number }>
      }
      const buyer = d.buyers?.[0]
      const seller = d.sellers?.[0]
      const vehicle = d.vehicles?.[0]
      const lines: string[] = []
      lines.push("## Deal state snapshot (truth — use this, don't re-ask things already true)")
      lines.push("")
      lines.push(`- **Deal #**: ${d.deal_number ?? dealId}`)
      lines.push(`- **Status**: ${d.status ?? "unknown"} · **Phase**: ${d.current_phase ?? "unknown"}`)
      lines.push(`- **Milestones done**: ${(d.completed_milestones ?? []).join(", ") || "(none)"}`)
      if (vehicle) lines.push(`- **Vehicle**: ${[vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ")}`)
      if (buyer)   lines.push(`- **Buyer**: ${buyer.full_name ?? "unknown"} · POPIA consent: ${buyer.consent_status ? "✅ granted" : "❌ pending"}`)
      if (seller)  lines.push(`- **Seller**: ${seller.full_name ?? "unknown"} · POPIA consent: ${seller.consent_status ? "✅ granted" : "❌ pending"} · Banking: ${seller.bank_account_number ? "on file" : "missing"}`)
      lines.push("")
      if (partyType === "seller") {
        lines.push("### Seller-flow rules (enforce strictly)")
        if (seller?.consent_status) {
          lines.push("- **POPIA already granted — DO NOT ask for consent again.** Move directly to the next outstanding step.")
        } else {
          lines.push("- POPIA NOT yet granted. After the seller taps \"I agree\", call `update_seller_record` with `{ consent_status: true, consent_timestamp: <ISO now> }` BEFORE moving on.")
        }
      } else {
        lines.push("### Buyer-flow rules (enforce strictly)")
        if (buyer?.consent_status) {
          lines.push("- POPIA already granted — DO NOT re-ask. Move to the next outstanding milestone.")
        }
      }
      return lines.join("\n")
    } catch (err) {
      console.warn("[agent] buildStateSnapshot failed:", err)
      return ""
    }
  }

  private async resolveDealId(phone: string, partyType: "buyer" | "seller"): Promise<string | null> {
    try {
      if (partyType === "seller") {
        const d = await getDealBySellerPhone(phone)
        return d?.id ?? null
      }
      const d = await getDealByBuyerPhone(phone)
      return d?.id ?? null
    } catch { return null }
  }

  private async resolvePartyType(phone: string): Promise<"buyer" | "seller"> {
    try {
      const sellerDeal = await getDealBySellerPhone(phone)
      if (sellerDeal) return "seller"
      return "buyer"
    } catch { return "buyer" }
  }

  // deno-lint-ignore no-explicit-any
  private async runAgentLoop(systemPrompt: string, messages: any[], phone: string): Promise<string | null> {
    let currentMessages = [...messages]
    let iterations = 0
    while (iterations < MAX_TOOL_ITERATIONS) {
      iterations++
      const response = await this.client.messages.create({
        model: MODEL,
        max_tokens: 1024,
        system: systemPrompt,
        // deno-lint-ignore no-explicit-any
        tools: AGENT_TOOLS as any,
        messages: currentMessages,
      })
      if (response.stop_reason === "end_turn") {
        const textBlock = (response.content as Array<{ type: string; text?: string }>)
          .find((b) => b.type === "text")
        return textBlock?.text ?? null
      }
      if (response.stop_reason === "tool_use") {
        currentMessages.push({ role: "assistant", content: response.content })
        const toolResults: Array<Record<string, unknown>> = []
        for (const block of response.content as Array<{ type: string; id?: string; name?: string; input?: unknown }>) {
          if (block.type !== "tool_use") continue
          const handler = TOOL_HANDLERS[block.name as string]
          let toolOutput: unknown
          if (!handler) {
            toolOutput = { success: false, error: `Unknown tool: ${block.name}` }
          } else {
            try {
              toolOutput = await handler(block.input as Record<string, unknown>)
            } catch (err) {
              const msg = err instanceof Error ? err.message
                : err && typeof err === "object"
                ? (err as { message?: string }).message ?? JSON.stringify(err, Object.getOwnPropertyNames(err))
                : String(err)
              console.error(`[agent] Tool "${block.name}" failed:`, msg, err)
              toolOutput = { success: false, error: msg }
            }
          }
          await this.persistOutboundIfNeeded(
            phone, block.name as string, block.input as Record<string, unknown>, toolOutput,
          )
          toolResults.push({ type: "tool_result", tool_use_id: block.id, content: JSON.stringify(toolOutput) })
        }
        currentMessages.push({ role: "user", content: toolResults })
        continue
      }
      const fallbackText = (response.content as Array<{ type: string; text?: string }>)
        .filter((b) => b.type === "text").map((b) => b.text ?? "").join("\n")
      return fallbackText || null
    }
    console.warn(`[agent] Max tool iterations (${MAX_TOOL_ITERATIONS}) reached for ${phone}`)
    return "I'm sorry, I ran into a problem processing your request. Please try again or contact our support team."
  }

  private async persistOutboundIfNeeded(
    convoPhone: string, toolName: string,
    input: Record<string, unknown>, output: unknown,
  ): Promise<void> {
    try {
      const ok = (output as { success?: boolean })?.success !== false
      if (!ok) return
      const targetPhone = (input?.phone as string | undefined) ?? convoPhone
      if (targetPhone !== convoPhone) return
      let content: string | null = null
      if (toolName === "send_whatsapp_message") {
        content = (input.message as string) ?? null
      } else if (toolName === "send_buttons") {
        const body = (input.body as string) ?? ""
        const buttons = (input.buttons as Array<{ title?: string }> | undefined) ?? []
        const labels = buttons.map((b) => `[${b.title ?? "?"}]`).join(" ")
        content = `${body}\n\n${labels}`
      } else if (toolName === "send_list") {
        const body = (input.body as string) ?? ""
        const sections = (input.sections as Array<{ rows?: Array<{ title?: string }> }> | undefined) ?? []
        const items = sections.flatMap((s) => s.rows ?? []).map((r) => `• ${r.title ?? "?"}`).join("\n")
        content = `${body}\n\n${items}`
      }
      if (!content) return
      const buyerDeal = await getDealByBuyerPhone(convoPhone).catch(() => null)
      const sellerDeal = !buyerDeal ? await getDealBySellerPhone(convoPhone).catch(() => null) : null
      const dealId = (buyerDeal?.id ?? sellerDeal?.id) as string | undefined
      await saveMessage(convoPhone, "assistant", content, {
        tool_use: { via_tool: toolName }, deal_id: dealId,
      })
    } catch (e) {
      console.warn("[agent] persistOutboundIfNeeded failed:", String(e))
    }
  }
}

export const agent = new VehicleFinanceAgent()
