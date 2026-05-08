import Anthropic from '@anthropic-ai/sdk';
import { BUYER_SYSTEM_PROMPT, SELLER_SYSTEM_PROMPT } from './system-prompts.js';
import { AGENT_TOOLS } from './tools.js';
import { TOOL_HANDLERS } from './tool-handlers.js';
import {
  loadConversationHistory,
  saveMessage,
  buildMessagesArray,
  pruneOldMessages,
} from './memory.js';
import { getDealBySellerPhone, getDealByBuyerPhone } from '../services/supabase.js';
import { sendTextMessage } from '../services/dialog360.js';

const MODEL = 'claude-sonnet-4-6';
const MAX_TOOL_ITERATIONS = 15;

export class VehicleFinanceAgent {
  private client: Anthropic;

  constructor() {
    this.client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }

  async processMessage(
    phone: string,
    message: string,
    mediaId?: string,
  ): Promise<void> {
    // 1. Determine party type by looking up the phone in the database
    const partyType = await this.resolvePartyType(phone);
    const basePrompt =
      partyType === 'seller' ? SELLER_SYSTEM_PROMPT : BUYER_SYSTEM_PROMPT;

    // Resolve deal_id so saved messages are correctly linked to the deal.
    // Without this the dashboard's Conversation tab can't find them by deal.
    const dealId = await this.resolveDealId(phone, partyType);

    // Snapshot the deal state for the model so it doesn't re-ask for things
    // already done. Without this snapshot the seller flow (in particular)
    // loops POPIA every time because the system prompt has no ground truth.
    const stateSnapshot = await this.buildStateSnapshot(dealId, partyType);

    // Inject the runtime phone so tools that send back to the user (send_buttons,
    // send_list, send_whatsapp_message, etc.) always use the right number.
    // Without this the model invents phones from user-typed text and Dialog360
    // rejects with 400.
    const systemPrompt = `${basePrompt}

## Conversation context (runtime)

- **The user you are talking to is on WhatsApp at phone: \`${phone}\` (E.164, no leading +).**
- When you call **send_buttons**, **send_list**, or any **send_whatsapp_message** that targets *this same user*, you MUST pass \`phone="${phone}"\`.
- Never pull a phone number out of the user's typed text and use it as the recipient. Numbers the user types (like a local "0821234567") are for your records, not for sending.
- Only use a *different* phone number when explicitly addressing the other party.

${stateSnapshot}
`;

    // 2. Build the user message (append media context if present)
    const userContent = mediaId
      ? `${message || ''}[User sent a document/photo — media_id: ${mediaId}]`.trim()
      : message;

    // 3. Persist the incoming user message
    await saveMessage(phone, 'user', userContent, { party_type: partyType, deal_id: dealId ?? undefined });

    // 4. Load conversation history (excluding the message we just saved — we'll add it manually)
    const history = await loadConversationHistory(phone, 29, partyType);
    const messagesArray = buildMessagesArray(history.slice(0, -1), userContent);

    // 5. Run the agentic loop
    const agentReply = await this.runAgentLoop(systemPrompt, messagesArray, phone);

    // 6. Send the final reply to the customer via Dialog360
    if (agentReply) {
      await sendTextMessage(phone, agentReply);
      await saveMessage(phone, 'assistant', agentReply, { party_type: partyType, deal_id: dealId ?? undefined });
    }

    // 7. Prune conversation to keep context manageable
    await pruneOldMessages(phone, 100).catch(() => {
      // Non-critical — log and continue
      console.warn(`[agent] Failed to prune messages for ${phone}`);
    });
  }

  /**
   * Build a state snapshot block for the system prompt so the model has ground
   * truth on what's already done — prevents loops like re-asking for POPIA
   * after the seller already agreed.
   */
  private async buildStateSnapshot(
    dealId: string | null,
    partyType: 'buyer' | 'seller',
  ): Promise<string> {
    if (!dealId) return ''
    try {
      const { getDealById } = await import('../services/supabase.js')
      const deal = await getDealById(dealId)
      if (!deal) return ''
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
      lines.push('## Deal state snapshot (truth — use this, don\'t re-ask things already true)')
      lines.push('')
      lines.push(`- **Deal #**: ${d.deal_number ?? dealId}`)
      lines.push(`- **Status**: ${d.status ?? 'unknown'} · **Phase**: ${d.current_phase ?? 'unknown'}`)
      lines.push(`- **Milestones done**: ${(d.completed_milestones ?? []).join(', ') || '(none)'}`)
      if (vehicle) lines.push(`- **Vehicle**: ${[vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ')}`)
      if (buyer)   lines.push(`- **Buyer**: ${buyer.full_name ?? 'unknown'} · POPIA consent: ${buyer.consent_status ? '✅ granted' : '❌ pending'}`)
      if (seller)  lines.push(`- **Seller**: ${seller.full_name ?? 'unknown'} · POPIA consent: ${seller.consent_status ? '✅ granted' : '❌ pending'} · Banking: ${seller.bank_account_number ? 'on file' : 'missing'}`)
      lines.push('')
      if (partyType === 'seller') {
        lines.push('### Seller-flow rules (enforce strictly)')
        if (seller?.consent_status) {
          lines.push('- **POPIA already granted — DO NOT ask for consent again.** Move directly to the next outstanding step.')
        } else {
          lines.push('- POPIA NOT yet granted. After the seller taps "I agree", call `update_seller_record` with `{ consent_status: true, consent_timestamp: <ISO now> }` BEFORE moving on.')
        }
      } else {
        lines.push('### Buyer-flow rules (enforce strictly)')
        if (buyer?.consent_status) {
          lines.push('- POPIA already granted — DO NOT re-ask. Move to the next outstanding milestone.')
        }
      }
      return lines.join('\n')
    } catch (err) {
      console.warn('[agent] buildStateSnapshot failed:', err)
      return ''
    }
  }

  private async resolveDealId(phone: string, partyType: 'buyer' | 'seller'): Promise<string | null> {
    try {
      if (partyType === 'seller') {
        const d = await getDealBySellerPhone(phone);
        return d?.id ?? null;
      }
      const d = await getDealByBuyerPhone(phone);
      return d?.id ?? null;
    } catch {
      return null;
    }
  }

  private async resolvePartyType(phone: string): Promise<'buyer' | 'seller'> {
    try {
      const sellerDeal = await getDealBySellerPhone(phone);
      if (sellerDeal) return 'seller';
      return 'buyer';
    } catch {
      return 'buyer'; // default to buyer on lookup failure
    }
  }

  private async runAgentLoop(
    systemPrompt: string,
    messages: Anthropic.MessageParam[],
    phone: string,
  ): Promise<string | null> {
    let currentMessages = [...messages];
    let iterations = 0;

    while (iterations < MAX_TOOL_ITERATIONS) {
      iterations++;

      const response = await this.client.messages.create({
        model: MODEL,
        max_tokens: 1024,
        system: systemPrompt,
        tools: AGENT_TOOLS,
        messages: currentMessages,
      });

      // If the model produced a text response, we're done
      if (response.stop_reason === 'end_turn') {
        const textBlock = response.content.find(
          (block): block is Anthropic.TextBlock => block.type === 'text',
        );
        return textBlock?.text ?? null;
      }

      // Handle tool_use blocks
      if (response.stop_reason === 'tool_use') {
        // Append the assistant's response (which contains tool_use blocks) to the message history
        currentMessages.push({ role: 'assistant', content: response.content });

        // Execute each tool call and collect results
        const toolResults: Anthropic.ToolResultBlockParam[] = [];

        for (const block of response.content) {
          if (block.type !== 'tool_use') continue;

          const handler = TOOL_HANDLERS[block.name];
          let toolOutput: unknown;

          if (!handler) {
            toolOutput = { success: false, error: `Unknown tool: ${block.name}` };
          } else {
            try {
              toolOutput = await handler(block.input as Record<string, unknown>);
            } catch (err) {
              const message =
                err instanceof Error
                  ? err.message
                  : err && typeof err === 'object'
                  ? (err as { message?: string }).message ??
                    JSON.stringify(err, Object.getOwnPropertyNames(err))
                  : String(err);
              console.error(`[agent] Tool "${block.name}" failed:`, message, err);
              toolOutput = { success: false, error: message };
            }
          }

          // Persist user-facing outbound messages so the next turn has them
          // in conversation history. Without this, button/list replies are
          // sent to WhatsApp but the agent forgets it asked the question, and
          // re-asks the user to do something they already did.
          await this.persistOutboundIfNeeded(
            phone,
            block.name,
            block.input as Record<string, unknown>,
            toolOutput,
          );

          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: JSON.stringify(toolOutput),
          });
        }

        // Feed tool results back to the model
        currentMessages.push({ role: 'user', content: toolResults });
        continue;
      }

      // Unexpected stop reason — return whatever text we have
      const fallbackText = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('\n');
      return fallbackText || null;
    }

    console.warn(`[agent] Max tool iterations (${MAX_TOOL_ITERATIONS}) reached for ${phone}`);
    return "I'm sorry, I ran into a problem processing your request. Please try again or contact our support team.";
  }

  /**
   * After a user-facing message-sending tool runs successfully, persist what
   * was sent to conversation_messages so the next turn has it in history.
   * Without this, send_buttons / send_list replies vanish from the agent's
   * context and it re-asks for things the user already answered.
   *
   * Tools handled:
   *   - send_whatsapp_message  → save the body
   *   - send_buttons           → save the body + button titles
   *   - send_list              → save the body + section/row titles
   * Tools that target ANOTHER party (notify_seller etc) are skipped — those
   * messages belong to the seller's history, not this conversation.
   */
  private async persistOutboundIfNeeded(
    convoPhone: string,
    toolName: string,
    input: Record<string, unknown>,
    output: unknown,
  ): Promise<void> {
    try {
      const ok = (output as { success?: boolean })?.success !== false;
      if (!ok) return;

      const targetPhone = (input?.phone as string | undefined) ?? convoPhone;
      // Only save when we're talking to the same user this turn is about.
      if (targetPhone !== convoPhone) return;

      let content: string | null = null;
      if (toolName === 'send_whatsapp_message') {
        content = (input.message as string) ?? null;
      } else if (toolName === 'send_buttons') {
        const body = (input.body as string) ?? '';
        const buttons = (input.buttons as Array<{ title?: string }> | undefined) ?? [];
        const labels = buttons.map((b) => `[${b.title ?? '?'}]`).join(' ');
        content = `${body}\n\n${labels}`;
      } else if (toolName === 'send_list') {
        const body = (input.body as string) ?? '';
        const sections = (input.sections as Array<{ rows?: Array<{ title?: string }> }> | undefined) ?? [];
        const items = sections
          .flatMap((s) => s.rows ?? [])
          .map((r) => `• ${r.title ?? '?'}`)
          .join('\n');
        content = `${body}\n\n${items}`;
      }
      if (!content) return;

      // Best-effort dealId lookup so this row is queryable by deal.
      const buyerDeal = await getDealByBuyerPhone(convoPhone).catch(() => null);
      const sellerDeal = !buyerDeal ? await getDealBySellerPhone(convoPhone).catch(() => null) : null;
      const dealId = buyerDeal?.id ?? sellerDeal?.id;
      await saveMessage(convoPhone, 'assistant', content, {
        tool_use: { via_tool: toolName },
        deal_id: dealId,
      });
    } catch (e) {
      console.warn('[agent] persistOutboundIfNeeded failed:', String(e));
    }
  }
}

// Singleton instance
export const agent = new VehicleFinanceAgent();
