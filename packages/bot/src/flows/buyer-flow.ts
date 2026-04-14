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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function text(body: string): BotResponse {
  return { type: 'text', text: body };
}

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

function extractButtonId(msg: D360Message): string | null {
  if (msg.type === 'interactive' && msg.interactive?.button_reply) {
    return msg.interactive.button_reply.id;
  }
  if (msg.type === 'button' && msg.button) return msg.button.payload;
  return null;
}

function hasMedia(msg: D360Message): boolean {
  return ['image', 'document'].includes(msg.type);
}

// ---------------------------------------------------------------------------
// State handlers
// ---------------------------------------------------------------------------

/**
 * WELCOME
 * Triggered on the very first message from a new buyer contact.
 */
async function handleWelcome(
  _msg: D360Message,
  _state: ConversationState,
): Promise<FlowResult> {
  return {
    nextStep: 'CONSENT',
    responses: [
      text(
        'Welcome to VehicleFinance! 🚗\n\nWe help you get vehicle finance quickly and securely via WhatsApp.\n\nBefore we begin, please review our Privacy Policy and Terms of Service.',
      ),
      buttons(
        'Do you consent to our Terms of Service and Privacy Policy, and agree for us to process your personal information to assess your finance application?',
        [
          { id: 'consent_yes', title: 'Yes, I agree' },
          { id: 'consent_no', title: 'No, decline' },
        ],
      ),
    ],
  };
}

/**
 * CONSENT
 * Capture yes/no consent response.
 */
async function handleConsent(
  msg: D360Message,
  _state: ConversationState,
): Promise<FlowResult> {
  const id = extractButtonId(msg);
  const txt = (extractText(msg) ?? '').toLowerCase();

  const agreed =
    id === 'consent_yes' ||
    txt.includes('yes') ||
    txt.includes('agree') ||
    txt.includes('i agree');

  if (!agreed) {
    return {
      nextStep: 'CONSENT',
      responses: [
        text(
          'No problem. If you change your mind and would like to apply for vehicle finance, feel free to message us again. Goodbye! 👋',
        ),
      ],
    };
  }

  return {
    nextStep: 'ID_UPLOAD',
    responses: [
      text(
        "Great, thank you! ✅\n\nLet's start collecting your documents.\n\n*Step 1 of 3 — Identity Document*\n\nPlease send a clear photo or PDF of your South African ID document (green bar-coded ID, Smart ID card, or Passport).",
      ),
    ],
    dealUpdate: {},
  };
}

/**
 * ID_UPLOAD
 * Wait for an image or document containing the ID.
 */
async function handleIdUpload(
  msg: D360Message,
  _state: ConversationState,
): Promise<FlowResult> {
  if (!hasMedia(msg)) {
    return {
      nextStep: 'ID_UPLOAD',
      responses: [
        text(
          "Please send your ID document as a *photo* or *PDF file*.\n\nEnsure the document is clear and all four corners are visible.",
        ),
      ],
    };
  }

  return {
    nextStep: 'POA_UPLOAD',
    responses: [
      text(
        "ID document received! ✅\n\n*Step 2 of 3 — Proof of Address (POA)*\n\nPlease send a utility bill, bank statement, or official letter showing your current address. It must be *dated within the last 3 months*.",
      ),
    ],
  };
}

/**
 * POA_UPLOAD
 * Wait for proof-of-address document.
 */
async function handlePoaUpload(
  msg: D360Message,
  _state: ConversationState,
): Promise<FlowResult> {
  if (!hasMedia(msg)) {
    return {
      nextStep: 'POA_UPLOAD',
      responses: [
        text(
          "Please send your Proof of Address as a *photo* or *PDF file*. Acceptable documents include a utility bill, bank statement, or official municipal letter (not older than 3 months).",
        ),
      ],
    };
  }

  return {
    nextStep: 'BANK_STATEMENT_UPLOAD',
    responses: [
      text(
        "Proof of address received! ✅\n\n*Step 3 of 3 — Bank Statements*\n\nPlease send your last *3 months' bank statements* as PDF files. You can send them one at a time or as a single combined PDF.",
      ),
    ],
  };
}

/**
 * BANK_STATEMENT_UPLOAD
 * Collect bank statements; allow multiple uploads before confirmation.
 */
async function handleBankStatementUpload(
  msg: D360Message,
  state: ConversationState,
): Promise<FlowResult> {
  const statementsReceived: number =
    (state.context.bank_statements_received as number | undefined) ?? 0;

  if (!hasMedia(msg)) {
    // Check if user said they are done uploading
    const txt = (extractText(msg) ?? '').toLowerCase();
    if (
      (txt.includes('done') || txt.includes('finish') || txt.includes('complete')) &&
      statementsReceived > 0
    ) {
      return {
        nextStep: 'DATA_CONFIRMATION',
        responses: [
          text(
            `Bank statements received (${statementsReceived} file(s)). ✅\n\nI am now extracting your information. Please hold on for a moment...`,
          ),
        ],
      };
    }

    return {
      nextStep: 'BANK_STATEMENT_UPLOAD',
      responses: [
        text(
          'Please send your bank statements as *PDF files*. Once you have sent all statements, reply *Done*.',
        ),
      ],
    };
  }

  const newCount = statementsReceived + 1;

  if (newCount < 3) {
    return {
      nextStep: 'BANK_STATEMENT_UPLOAD',
      responses: [
        text(
          `Statement ${newCount} received ✅\n\nPlease send the next statement, or reply *Done* if you have sent all statements.`,
        ),
      ],
      dealUpdate: { bank_statements_received: newCount } as never,
    };
  }

  // 3+ statements received — move on
  return {
    nextStep: 'DATA_CONFIRMATION',
    responses: [
      text(
        `Bank statements received (${newCount} file(s)). ✅\n\nI am now extracting your information. Please hold on for a moment...`,
      ),
    ],
  };
}

/**
 * DATA_CONFIRMATION
 * Show extracted data to buyer for confirmation.
 * In practice, extracted_data is populated by the extraction service before
 * the bot enters this state.
 */
async function handleDataConfirmation(
  msg: D360Message,
  state: ConversationState,
): Promise<FlowResult> {
  const id = extractButtonId(msg);
  const txt = (extractText(msg) ?? '').toLowerCase();

  // If we haven't shown the data yet, display it
  if (!state.context.data_shown) {
    const extracted = (state.context.extracted_data as Record<string, string> | undefined) ?? {};
    const summary =
      Object.keys(extracted).length > 0
        ? Object.entries(extracted)
            .map(([k, v]) => `• *${k}*: ${v}`)
            .join('\n')
        : '_(Data extraction in progress — please wait a moment and try again)_';

    return {
      nextStep: 'DATA_CONFIRMATION',
      responses: [
        text(`Here is the information we extracted from your documents:\n\n${summary}`),
        buttons('Is all the information above correct?', [
          { id: 'confirm_yes', title: 'Yes, correct' },
          { id: 'confirm_no', title: 'No, something is wrong' },
        ]),
      ],
    };
  }

  const confirmed =
    id === 'confirm_yes' || txt.includes('yes') || txt.includes('correct');

  if (!confirmed) {
    return {
      nextStep: 'DATA_CONFIRMATION',
      responses: [
        text(
          "I'm sorry about that. Please describe what information is incorrect and a consultant will assist you shortly.",
        ),
      ],
    };
  }

  return {
    nextStep: 'SELLER_DETAILS',
    responses: [
      text(
        "Information confirmed! ✅\n\n*Seller Details*\n\nPlease provide the WhatsApp number of the person selling the vehicle. Format: +27XXXXXXXXX",
      ),
    ],
  };
}

/**
 * SELLER_DETAILS
 * Collect the seller's WhatsApp number so we can invite them.
 */
async function handleSellerDetails(
  msg: D360Message,
  _state: ConversationState,
): Promise<FlowResult> {
  const txt = extractText(msg) ?? '';
  // Basic E.164 validation
  const phoneMatch = txt.match(/(\+?27[0-9]{9}|0[0-9]{9})/);

  if (!phoneMatch) {
    return {
      nextStep: 'SELLER_DETAILS',
      responses: [
        text(
          "Please provide a valid South African WhatsApp number for the seller.\n\nFormat: *+27821234567* or *0821234567*",
        ),
      ],
    };
  }

  let sellerPhone = phoneMatch[1];
  if (sellerPhone.startsWith('0')) {
    sellerPhone = '27' + sellerPhone.slice(1);
  } else if (sellerPhone.startsWith('+')) {
    sellerPhone = sellerPhone.slice(1);
  }

  return {
    nextStep: 'WAITING_FOR_QUOTE',
    responses: [
      text(
        `Thank you! We have noted the seller's number: *+${sellerPhone}*\n\nWe will now invite the seller to submit their vehicle documents.\n\nA consultant will review your application and send you a finance quote. This usually takes *1–2 business days*.\n\nWe will notify you on WhatsApp when your quote is ready. 📋`,
      ),
    ],
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
  _state: ConversationState,
): Promise<FlowResult> {
  return {
    nextStep: 'WAITING_FOR_QUOTE',
    responses: [
      text(
        "Your application is under review. We will contact you as soon as your quote is ready. Thank you for your patience! 🙏",
      ),
    ],
  };
}

/**
 * QUOTE_REVIEW
 * Buyer has received a quote (pushed by sendQuoteToBuyer) and must accept/decline.
 */
async function handleQuoteReview(
  msg: D360Message,
  state: ConversationState,
): Promise<FlowResult> {
  const id = extractButtonId(msg);
  const txt = (extractText(msg) ?? '').toLowerCase();

  // First entry — quote has just been sent; any message here is a response
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
    const quote = state.context.quote_data as QuoteData | undefined;
    const summary = quote
      ? `Loan amount: R${quote.loanAmount.toLocaleString()}\nInterest rate: ${quote.interestRate}% p.a.\nTerm: ${quote.termMonths} months\nMonthly instalment: R${quote.monthlyInstalment.toLocaleString()}\nTotal repayable: R${quote.totalRepayable.toLocaleString()}`
      : '_(Quote details not available)_';

    return {
      nextStep: 'QUOTE_REVIEW',
      responses: [
        text(`Your finance quote:\n\n${summary}`),
        buttons('Would you like to proceed with this quote?', [
          { id: 'quote_accept', title: 'Accept quote' },
          { id: 'quote_decline', title: 'Decline' },
        ]),
      ],
    };
  }

  if (declined) {
    return {
      nextStep: 'DONE',
      responses: [
        text(
          "Thank you for considering VehicleFinance. You have declined this quote. If you would like a new quote in future, please start a new conversation. 👋",
        ),
      ],
      dealUpdate: { status: 'quote_declined' },
    };
  }

  return {
    nextStep: 'CONTRACT_SIGNING',
    responses: [
      text(
        "Quote accepted! ✅\n\nWe are preparing your loan agreement. You will receive a secure signing link shortly. Please review and sign the contract at your earliest convenience.",
      ),
    ],
    dealUpdate: { status: 'quote_accepted' },
  };
}

/**
 * CONTRACT_SIGNING
 * Buyer needs to sign the contract via the link sent separately.
 */
async function handleContractSigning(
  msg: D360Message,
  _state: ConversationState,
): Promise<FlowResult> {
  const txt = (extractText(msg) ?? '').toLowerCase();

  if (txt.includes('signed') || txt.includes('done') || txt.includes('complete')) {
    return {
      nextStep: 'DONE',
      responses: [
        text(
          "Congratulations! 🎉 Your contract has been signed and your finance application is being finalised.\n\nA consultant will be in touch within 1 business day to complete the disbursement process. Thank you for choosing VehicleFinance!",
        ),
      ],
      dealUpdate: { status: 'contract_signed' },
    };
  }

  return {
    nextStep: 'CONTRACT_SIGNING',
    responses: [
      text(
        "Please sign the contract using the link we sent you. Once signed, reply *Signed* here to confirm. If you have not received the link, please reply *Resend*.",
      ),
    ],
  };
}

/**
 * DONE
 * Terminal state — acknowledge any further messages gracefully.
 */
async function handleDone(
  _msg: D360Message,
  _state: ConversationState,
): Promise<FlowResult> {
  return {
    nextStep: 'DONE',
    responses: [
      text(
        "Your application is complete. For any further queries, please contact our support team. Thank you! 🚗",
      ),
    ],
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
