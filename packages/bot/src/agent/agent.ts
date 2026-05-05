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
import { getDealBySellerPhone } from '../services/supabase.js';
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

    // Inject the runtime phone so tools that send back to the user (send_buttons,
    // send_list, send_whatsapp_message, etc.) always use the right number.
    // Without this the model invents phones from user-typed text and Dialog360
    // rejects with 400.
    const systemPrompt = `${basePrompt}

## Conversation context (runtime)

- **The user you are talking to is on WhatsApp at phone: \`${phone}\` (E.164, no leading +).**
- When you call **send_buttons**, **send_list**, or any **send_whatsapp_message** that targets *this same user*, you MUST pass \`phone="${phone}"\`.
- Never pull a phone number out of the user's typed text and use it as the recipient. Numbers the user types (like a local "0821234567") are for your records, not for sending.
- Only use a *different* phone number when explicitly addressing the seller (after notify_seller has been called and you know the seller's number from get_deal_info).
`;

    // 2. Build the user message (append media context if present)
    const userContent = mediaId
      ? `${message || ''}[User sent a document/photo — media_id: ${mediaId}]`.trim()
      : message;

    // 3. Persist the incoming user message
    await saveMessage(phone, 'user', userContent, { party_type: partyType });

    // 4. Load conversation history (excluding the message we just saved — we'll add it manually)
    const history = await loadConversationHistory(phone, 29);
    const messagesArray = buildMessagesArray(history.slice(0, -1), userContent);

    // 5. Run the agentic loop
    const agentReply = await this.runAgentLoop(systemPrompt, messagesArray, phone);

    // 6. Send the final reply to the customer via Dialog360
    if (agentReply) {
      await sendTextMessage(phone, agentReply);
      await saveMessage(phone, 'assistant', agentReply, { party_type: partyType });
    }

    // 7. Prune conversation to keep context manageable
    await pruneOldMessages(phone, 100).catch(() => {
      // Non-critical — log and continue
      console.warn(`[agent] Failed to prune messages for ${phone}`);
    });
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

      await saveMessage(convoPhone, 'assistant', content, { tool_use: { via_tool: toolName } });
    } catch (e) {
      console.warn('[agent] persistOutboundIfNeeded failed:', String(e));
    }
  }
}

// Singleton instance
export const agent = new VehicleFinanceAgent();
