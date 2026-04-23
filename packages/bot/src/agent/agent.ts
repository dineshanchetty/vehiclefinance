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

const MODEL = 'claude-sonnet-4-20250514';
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
    const systemPrompt =
      partyType === 'seller' ? SELLER_SYSTEM_PROMPT : BUYER_SYSTEM_PROMPT;

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
              const message = err instanceof Error ? err.message : String(err);
              console.error(`[agent] Tool "${block.name}" failed:`, message);
              toolOutput = { success: false, error: message };
            }
          }

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
}

// Singleton instance
export const agent = new VehicleFinanceAgent();
