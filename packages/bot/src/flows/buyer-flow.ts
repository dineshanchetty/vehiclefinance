/**
 * Buyer conversation flow state machine.
 *
 * States:
 *   WELCOME → CONSENT → ID_UPLOAD → POA_UPLOAD → BANK_STATEMENT_UPLOAD
 *   → DATA_CONFIRMATION → SELLER_DETAILS → WAITING_FOR_QUOTE
 *   → QUOTE_REVIEW → CONTRACT_SIGNING → DONE
 *
 * Each exported handler accepts the inbound message and current conversation
 * state, and returns the next step plus bot responses to send back.
 *
 * CONTRACT: every state handler MUST persist conversation_state before returning.
 * Persistence is handled by the handleBuyerMessage router after the handler
 * returns, using saveState / advance from state/conversation.ts.
 */

import type {
  BotResponse,
  BuyerStep,
  ConversationContext,
  ConversationState,
  D360Message,
  FlowResult,
  QuoteData,
} from '../types/index.js';
import { STRINGS } from './strings.js';
import { advance, incrementMalformed, saveState } from '../state/conversation.js';
import { createOpsTask } from '../services/supabase.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a text BotResponse. */
function text(body: string): BotResponse {
  return { type: 'text', text: body };
}

/** Build an interactive button BotResponse. */
function buttons(
  body: string,
  opts: Array<{ id: string; title: string }>,
): BotResponse {
  return { type: 'interactive', body, buttons: opts };
}

/** Extract plain text from any inbound message (text, button reply, or list reply). */
function extractText(msg: D360Message): string | null {
  if (msg.type === 'text' && msg.text) return msg.text.body.trim();
  if (msg.type === 'interactive' && msg.interactive) {
    return (
      msg.interactive.button_reply?.title ??
      msg.interactive.list_reply?.title ??
      null
    );
  }
  if (msg.type === 'button' && msg.button) return msg.button.payload;
  return null;
}

/** Extract the button reply ID. */
function extractButtonId(msg: D360Message): string | null {
  if (msg.type === 'interactive' && msg.interactive?.button_reply) {
    return msg.interactive.button_reply.id;
  }
  if (msg.type === 'button' && msg.button) return msg.button.payload;
  return null;
}

/** True if the message carries an image or document attachment. */
function hasMedia(msg: D360Message): boolean {
  return ['image', 'document'].includes(msg.type);
}

/**
 * Create a Q_HUMAN_ESCALATION ops task and advance state to DONE.
 * Called when malformed_count reaches 3.
 */
async function escalateToHuman(
  state: ConversationState,
): Promise<FlowResult> {
  try {
    await createOpsTask({
      deal_id: state.deal_id ?? undefined,
      task_type: 'Q_HUMAN_ESCALATION',
      description: `Buyer ${state.phone} sent 3 consecutive unrecognised inputs at step ${state.current_step}. Human agent required.`,
      priority: 'high',
    });
  } catch {
    // Non-fatal — log and continue
    console.warn(`[buyer-flow] Failed to create escalation task for ${state.phone}`);
  }

  return {
    nextStep: 'DONE',
    responses: [text(STRINGS.ESCALATED_TO_HUMAN)],
  };
}

// ---------------------------------------------------------------------------
// State handlers
// ---------------------------------------------------------------------------

/**
 * WELCOME
 * Triggered on the very first message from a new buyer contact.
 * Always advances to CONSENT — no validation needed.
 */
async function handleWelcome(
  _msg: D360Message,
  state: ConversationState,
): Promise<FlowResult> {
  await advance(state.phone, 'CONSENT', 'buyer', state.deal_id);
  return {
    nextStep: 'CONSENT',
    responses: [
      text(STRINGS.BUYER.WELCOME_INTRO),
      buttons(STRINGS.BUYER.WELCOME_CONSENT_QUESTION, [
        { id: 'consent_yes', title: STRINGS.BUYER.WELCOME_CONSENT_YES },
        { id: 'consent_no', title: STRINGS.BUYER.WELCOME_CONSENT_NO },
      ]),
    ],
  };
}

/**
 * CONSENT
 * Capture yes/no consent response.
 * Counts non-affirmative, non-negative inputs as malformed.
 */
async function handleConsent(
  msg: D360Message,
  state: ConversationState,
): Promise<FlowResult> {
  const id = extractButtonId(msg);
  const txt = (extractText(msg) ?? '').toLowerCase();

  const agreed =
    id === 'consent_yes' ||
    txt.includes('yes') ||
    txt.includes('agree') ||
    txt.includes('i agree');

  const declined =
    id === 'consent_no' ||
    txt.includes('no') ||
    txt.includes('decline') ||
    txt.includes('reject');

  if (agreed) {
    await advance(state.phone, 'ID_UPLOAD', 'buyer', state.deal_id, { consented: true });
    return {
      nextStep: 'ID_UPLOAD',
      responses: [text(STRINGS.BUYER.CONSENT_ACCEPTED_ID_PROMPT)],
      dealUpdate: {},
    };
  }

  if (declined) {
    await saveState(state.phone, 'DONE', 'buyer', state.deal_id, {}, 0, false);
    return {
      nextStep: 'DONE',
      responses: [text(STRINGS.BUYER.CONSENT_DECLINED)],
    };
  }

  // Ambiguous input — increment malformed
  const count = await incrementMalformed(state.phone);
  if (count >= 3) return escalateToHuman(state);

  return {
    nextStep: 'CONSENT',
    responses: [
      buttons(STRINGS.BUYER.WELCOME_CONSENT_QUESTION, [
        { id: 'consent_yes', title: STRINGS.BUYER.WELCOME_CONSENT_YES },
        { id: 'consent_no', title: STRINGS.BUYER.WELCOME_CONSENT_NO },
      ]),
    ],
  };
}

/**
 * ID_UPLOAD
 * Wait for an image or document containing the ID.
 */
async function handleIdUpload(
  msg: D360Message,
  state: ConversationState,
): Promise<FlowResult> {
  if (!hasMedia(msg)) {
    const count = await incrementMalformed(state.phone);
    if (count >= 3) return escalateToHuman(state);
    return {
      nextStep: 'ID_UPLOAD',
      responses: [text(STRINGS.BUYER.ID_UPLOAD_PROMPT)],
    };
  }

  await advance(state.phone, 'POA_UPLOAD', 'buyer', state.deal_id);
  return {
    nextStep: 'POA_UPLOAD',
    responses: [text(STRINGS.BUYER.ID_UPLOAD_RECEIVED)],
  };
}

/**
 * POA_UPLOAD
 * Wait for proof-of-address document.
 */
async function handlePoaUpload(
  msg: D360Message,
  state: ConversationState,
): Promise<FlowResult> {
  if (!hasMedia(msg)) {
    const count = await incrementMalformed(state.phone);
    if (count >= 3) return escalateToHuman(state);
    return {
      nextStep: 'POA_UPLOAD',
      responses: [text(STRINGS.BUYER.POA_UPLOAD_PROMPT)],
    };
  }

  await advance(state.phone, 'BANK_STATEMENT_UPLOAD', 'buyer', state.deal_id);
  return {
    nextStep: 'BANK_STATEMENT_UPLOAD',
    responses: [text(STRINGS.BUYER.POA_UPLOAD_RECEIVED)],
  };
}

/**
 * BANK_STATEMENT_UPLOAD
 * Collect bank statements; allow multiple uploads before confirmation.
 * Counts files received in context.bank_statements_received.
 */
async function handleBankStatementUpload(
  msg: D360Message,
  state: ConversationState,
): Promise<FlowResult> {
  const statementsReceived: number =
    (state.context.bank_statements_received as number | undefined) ?? 0;

  if (!hasMedia(msg)) {
    const txt = (extractText(msg) ?? '').toLowerCase();
    const isDone =
      (txt.includes('done') || txt.includes('finish') || txt.includes('complete')) &&
      statementsReceived > 0;

    if (isDone) {
      await advance(state.phone, 'DATA_CONFIRMATION', 'buyer', state.deal_id, {
        bank_statements_received: statementsReceived,
      });
      return {
        nextStep: 'DATA_CONFIRMATION',
        responses: [text(STRINGS.BUYER.BANK_STATEMENT_PROCESSING(statementsReceived))],
      };
    }

    const count = await incrementMalformed(state.phone);
    if (count >= 3) return escalateToHuman(state);
    return {
      nextStep: 'BANK_STATEMENT_UPLOAD',
      responses: [text(STRINGS.BUYER.BANK_STATEMENT_PROMPT)],
    };
  }

  const newCount = statementsReceived + 1;

  if (newCount < 3) {
    await advance(state.phone, 'BANK_STATEMENT_UPLOAD', 'buyer', state.deal_id, {
      bank_statements_received: newCount,
    });
    return {
      nextStep: 'BANK_STATEMENT_UPLOAD',
      responses: [text(STRINGS.BUYER.BANK_STATEMENT_RECEIVED(newCount))],
      dealUpdate: { bank_statements_received: newCount } as never,
    };
  }

  // 3+ statements received — move on automatically
  await advance(state.phone, 'DATA_CONFIRMATION', 'buyer', state.deal_id, {
    bank_statements_received: newCount,
  });
  return {
    nextStep: 'DATA_CONFIRMATION',
    responses: [text(STRINGS.BUYER.BANK_STATEMENT_PROCESSING(newCount))],
  };
}

/**
 * DATA_CONFIRMATION
 * Show extracted data to buyer for confirmation.
 */
async function handleDataConfirmation(
  msg: D360Message,
  state: ConversationState,
): Promise<FlowResult> {
  const id = extractButtonId(msg);
  const txt = (extractText(msg) ?? '').toLowerCase();

  // If we haven't shown the data yet, display it
  if (!state.context.data_shown) {
    const extracted =
      (state.context.extracted_data as Record<string, string> | undefined) ?? {};
    const summary =
      Object.keys(extracted).length > 0
        ? Object.entries(extracted)
            .map(([k, v]) => `• *${k}*: ${v}`)
            .join('\n')
        : STRINGS.BUYER.DATA_CONFIRM_PENDING;

    // Persist data_shown flag
    await advance(state.phone, 'DATA_CONFIRMATION', 'buyer', state.deal_id, {
      data_shown: true,
    });

    return {
      nextStep: 'DATA_CONFIRMATION',
      responses: [
        text(`${STRINGS.BUYER.DATA_CONFIRM_HEADER}${summary}`),
        buttons(STRINGS.BUYER.DATA_CONFIRM_QUESTION, [
          { id: 'confirm_yes', title: STRINGS.BUYER.DATA_CONFIRM_YES },
          { id: 'confirm_no', title: STRINGS.BUYER.DATA_CONFIRM_NO },
        ]),
      ],
    };
  }

  const confirmed =
    id === 'confirm_yes' || txt.includes('yes') || txt.includes('correct');

  const denied =
    id === 'confirm_no' ||
    txt.includes('no') ||
    txt.includes('wrong') ||
    txt.includes('incorrect');

  if (confirmed) {
    await advance(state.phone, 'SELLER_DETAILS', 'buyer', state.deal_id);
    return {
      nextStep: 'SELLER_DETAILS',
      responses: [text(STRINGS.BUYER.DATA_CONFIRMED)],
    };
  }

  if (denied) {
    // Reset data_shown so corrected data can be re-presented
    await advance(state.phone, 'DATA_CONFIRMATION', 'buyer', state.deal_id, {
      data_shown: false,
    });
    return {
      nextStep: 'DATA_CONFIRMATION',
      responses: [text(STRINGS.BUYER.DATA_CONFIRM_CORRECTION_REQUEST)],
    };
  }

  const count = await incrementMalformed(state.phone);
  if (count >= 3) return escalateToHuman(state);
  return {
    nextStep: 'DATA_CONFIRMATION',
    responses: [
      buttons(STRINGS.BUYER.DATA_CONFIRM_QUESTION, [
        { id: 'confirm_yes', title: STRINGS.BUYER.DATA_CONFIRM_YES },
        { id: 'confirm_no', title: STRINGS.BUYER.DATA_CONFIRM_NO },
      ]),
    ],
  };
}

/**
 * SELLER_DETAILS
 * Collect the seller's WhatsApp number so we can invite them.
 */
async function handleSellerDetails(
  msg: D360Message,
  state: ConversationState,
): Promise<FlowResult> {
  const txt = extractText(msg) ?? '';
  const phoneMatch = txt.match(/(\+?27[0-9]{9}|0[0-9]{9})/);

  if (!phoneMatch) {
    const count = await incrementMalformed(state.phone);
    if (count >= 3) return escalateToHuman(state);
    return {
      nextStep: 'SELLER_DETAILS',
      responses: [text(STRINGS.BUYER.SELLER_PHONE_PROMPT)],
    };
  }

  let sellerPhone = phoneMatch[1];
  if (sellerPhone.startsWith('0')) {
    sellerPhone = '27' + sellerPhone.slice(1);
  } else if (sellerPhone.startsWith('+')) {
    sellerPhone = sellerPhone.slice(1);
  }

  await advance(state.phone, 'WAITING_FOR_QUOTE', 'buyer', state.deal_id, {
    seller_phone: sellerPhone,
  });

  return {
    nextStep: 'WAITING_FOR_QUOTE',
    responses: [text(STRINGS.BUYER.SELLER_DETAILS_SAVED(sellerPhone))],
    dealUpdate: { seller_phone: sellerPhone } as never,
  };
}

/**
 * WAITING_FOR_QUOTE
 * Passive state — bot does not expect action from buyer until quote arrives.
 * Any message from buyer gets a holding response.
 */
async function handleWaitingForQuote(
  _msg: D360Message,
  state: ConversationState,
): Promise<FlowResult> {
  // No state change — re-persist to update last_activity
  await advance(state.phone, 'WAITING_FOR_QUOTE', 'buyer', state.deal_id);
  return {
    nextStep: 'WAITING_FOR_QUOTE',
    responses: [text(STRINGS.BUYER.WAITING_FOR_QUOTE)],
  };
}

/**
 * QUOTE_REVIEW
 * Buyer has received a quote and must accept/decline.
 */
async function handleQuoteReview(
  msg: D360Message,
  state: ConversationState,
): Promise<FlowResult> {
  const id = extractButtonId(msg);
  const txt = (extractText(msg) ?? '').toLowerCase();

  const accepted =
    id === 'quote_accept' ||
    txt.includes('accept') ||
    txt.includes('yes') ||
    txt.includes('proceed');

  const declined =
    id === 'quote_decline' ||
    txt.includes('decline') ||
    txt.includes('no') ||
    txt.includes('reject');

  if (!accepted && !declined) {
    // Show/re-show quote
    const quote = state.context.quote_data as QuoteData | undefined;
    const summary = quote
      ? `Loan amount: R${quote.loanAmount.toLocaleString()}\nInterest rate: ${quote.interestRate}% p.a.\nTerm: ${quote.termMonths} months\nMonthly instalment: R${quote.monthlyInstalment.toLocaleString()}\nTotal repayable: R${quote.totalRepayable.toLocaleString()}`
      : '_(Quote details not available)_';

    const count = await incrementMalformed(state.phone);
    if (count >= 3) return escalateToHuman(state);

    return {
      nextStep: 'QUOTE_REVIEW',
      responses: [
        text(`${STRINGS.BUYER.QUOTE_REVIEW_HEADER}${summary}`),
        buttons(STRINGS.BUYER.QUOTE_REVIEW_QUESTION, [
          { id: 'quote_accept', title: STRINGS.BUYER.QUOTE_ACCEPT_BUTTON },
          { id: 'quote_decline', title: STRINGS.BUYER.QUOTE_DECLINE_BUTTON },
        ]),
      ],
    };
  }

  if (declined) {
    await saveState(state.phone, 'DONE', 'buyer', state.deal_id, {}, 0, false);
    return {
      nextStep: 'DONE',
      responses: [text(STRINGS.BUYER.QUOTE_DECLINED)],
      dealUpdate: { status: 'quote_declined' },
    };
  }

  await advance(state.phone, 'CONTRACT_SIGNING', 'buyer', state.deal_id);
  return {
    nextStep: 'CONTRACT_SIGNING',
    responses: [text(STRINGS.BUYER.QUOTE_ACCEPTED)],
    dealUpdate: { status: 'quote_accepted' },
  };
}

/**
 * CONTRACT_SIGNING
 * Buyer needs to sign the contract via the link sent separately.
 */
async function handleContractSigning(
  msg: D360Message,
  state: ConversationState,
): Promise<FlowResult> {
  const txt = (extractText(msg) ?? '').toLowerCase();

  if (txt.includes('signed') || txt.includes('done') || txt.includes('complete')) {
    await saveState(state.phone, 'DONE', 'buyer', state.deal_id, {}, 0, false);
    return {
      nextStep: 'DONE',
      responses: [text(STRINGS.BUYER.CONTRACT_SIGNED)],
      dealUpdate: { status: 'contract_signed' },
    };
  }

  await advance(state.phone, 'CONTRACT_SIGNING', 'buyer', state.deal_id);
  return {
    nextStep: 'CONTRACT_SIGNING',
    responses: [text(STRINGS.BUYER.CONTRACT_SIGNING_PROMPT)],
  };
}

/**
 * DONE
 * Terminal state — acknowledge any further messages gracefully.
 */
async function handleDone(
  _msg: D360Message,
  state: ConversationState,
): Promise<FlowResult> {
  // Re-persist to update last_activity (idempotent)
  await advance(state.phone, 'DONE', 'buyer', state.deal_id);
  return {
    nextStep: 'DONE',
    responses: [text(STRINGS.BUYER.DONE_MESSAGE)],
  };
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

/** Map each BuyerStep to its handler function. */
const HANDLERS: Record<
  BuyerStep,
  (msg: D360Message, state: ConversationState) => Promise<FlowResult>
> = {
  WELCOME: handleWelcome,
  CONSENT: handleConsent,
  ID_UPLOAD: handleIdUpload,
  POA_UPLOAD: handlePoaUpload,
  BANK_STATEMENT_UPLOAD: handleBankStatementUpload,
  DATA_CONFIRMATION: handleDataConfirmation,
  SELLER_DETAILS: handleSellerDetails,
  WAITING_FOR_QUOTE: handleWaitingForQuote,
  QUOTE_REVIEW: handleQuoteReview,
  CONTRACT_SIGNING: handleContractSigning,
  DONE: handleDone,
};

/**
 * Route an inbound message through the buyer flow.
 *
 * @param msg   - Parsed Dialog360 inbound message
 * @param state - Current conversation state (or a synthetic WELCOME state for new contacts)
 * @returns Next step + responses to dispatch
 */
export async function handleBuyerMessage(
  msg: D360Message,
  state: ConversationState,
): Promise<FlowResult> {
  const step = (state.current_step as BuyerStep) ?? 'WELCOME';
  const handler = HANDLERS[step] ?? handleWelcome;
  return handler(msg, state);
}

/**
 * Build an initial ConversationState for a brand-new buyer contact.
 */
export function newBuyerState(phone: string): ConversationState {
  return {
    phone,
    party_type: 'buyer',
    current_step: 'WELCOME',
    deal_id: null,
    last_activity: new Date().toISOString(),
    context: {} as ConversationContext,
  };
}
