/**
 * Centralised customer-facing string constants for all bot flows.
 *
 * COMPLIANCE NOTE: every string the bot sends to a user MUST originate here.
 * Do not add inline strings to buyer-flow.ts, seller-flow.ts, or webhook.ts.
 * All strings are in South-African English.
 */

// ---------------------------------------------------------------------------
// Shared / generic
// ---------------------------------------------------------------------------

export const STRINGS = {
  // ── Generic error / fallback ─────────────────────────────────────────────

  /** Sent when an unhandled exception occurs inside a flow handler. */
  GENERIC_ERROR:
    "I'm sorry, something went wrong. Please try again in a moment.",

  /** Sent when the phone is rate-limited. */
  RATE_LIMIT_EXCEEDED:
    "You are sending messages too quickly. Please wait a moment and try again.",

  /** Sent when a conversation is escalated to a human agent. */
  ESCALATED_TO_HUMAN:
    "I'm having difficulty understanding your responses. A consultant will be in touch with you shortly to assist. Thank you for your patience.",

  // ── Tool-layer cross-flow messages ────────────────────────────────────────

  /** Contract signing link message sent from send_contract_link tool. */
  CONTRACT_LINK_MESSAGE: (signingUrl: string) =>
    `Your contract is ready to sign!\n\n` +
    `Please click the link below to review and sign your vehicle finance contract:\n` +
    `${signingUrl}\n\n` +
    `The link is valid for 48 hours. Let me know if you have any questions.`,

  // ── Buyer flow ───────────────────────────────────────────────────────────

  BUYER: {
    // WELCOME state
    WELCOME_INTRO:
      "Welcome to VehicleFinance!\n\nWe help you get vehicle finance quickly and securely via WhatsApp.\n\nBefore we begin, please review our Privacy Policy and Terms of Service.",
    WELCOME_CONSENT_QUESTION:
      "Do you consent to our Terms of Service and Privacy Policy, and agree for us to process your personal information to assess your finance application?",
    WELCOME_CONSENT_YES: "Yes, I agree",
    WELCOME_CONSENT_NO: "No, decline",

    // CONSENT state
    CONSENT_DECLINED:
      "No problem. If you change your mind and would like to apply for vehicle finance, feel free to message us again. Goodbye!",
    CONSENT_ACCEPTED_ID_PROMPT:
      "Great, thank you!\n\nLet's start collecting your documents.\n\n*Step 1 of 3 — Identity Document*\n\nPlease send a clear photo or PDF of your South African ID document (green bar-coded ID, Smart ID card, or Passport).",

    // ID_UPLOAD state
    ID_UPLOAD_PROMPT:
      "Please send your ID document as a *photo* or *PDF file*.\n\nEnsure the document is clear and all four corners are visible.",
    ID_UPLOAD_RECEIVED:
      "ID document received!\n\n*Step 2 of 3 — Proof of Address (POA)*\n\nPlease send a utility bill, bank statement, or official letter showing your current address. It must be *dated within the last 3 months*.",

    // POA_UPLOAD state
    POA_UPLOAD_PROMPT:
      "Please send your Proof of Address as a *photo* or *PDF file*. Acceptable documents include a utility bill, bank statement, or official municipal letter (not older than 3 months).",
    POA_UPLOAD_RECEIVED:
      "Proof of address received!\n\n*Step 3 of 3 — Bank Statements*\n\nPlease send your last *3 months' bank statements* as PDF files. You can send them one at a time or as a single combined PDF.",

    // BANK_STATEMENT_UPLOAD state
    BANK_STATEMENT_PROMPT:
      "Please send your bank statements as *PDF files*. Once you have sent all statements, reply *Done*.",
    BANK_STATEMENT_RECEIVED: (count: number) =>
      `Statement ${count} received\n\nPlease send the next statement, or reply *Done* if you have sent all statements.`,
    BANK_STATEMENT_PROCESSING: (count: number) =>
      `Bank statements received (${count} file(s)).\n\nI am now extracting your information. Please hold on for a moment...`,

    // DATA_CONFIRMATION state
    DATA_CONFIRM_HEADER: "Here is the information we extracted from your documents:\n\n",
    DATA_CONFIRM_PENDING: "_(Data extraction in progress — please wait a moment and try again)_",
    DATA_CONFIRM_QUESTION: "Is all the information above correct?",
    DATA_CONFIRM_YES: "Yes, correct",
    DATA_CONFIRM_NO: "No, something is wrong",
    DATA_CONFIRM_CORRECTION_REQUEST:
      "I'm sorry about that. Please describe what information is incorrect and a consultant will assist you shortly.",
    DATA_CONFIRMED:
      "Information confirmed!\n\n*Seller Details*\n\nPlease provide the WhatsApp number of the person selling the vehicle. Format: +27XXXXXXXXX",

    // SELLER_DETAILS state
    SELLER_PHONE_PROMPT:
      "Please provide a valid South African WhatsApp number for the seller.\n\nFormat: *+27821234567* or *0821234567*",
    SELLER_DETAILS_SAVED: (phone: string) =>
      `Thank you! We have noted the seller's number: *+${phone}*\n\nWe will now invite the seller to submit their vehicle documents.\n\nA consultant will review your application and send you a finance quote. This usually takes *1–2 business days*.\n\nWe will notify you on WhatsApp when your quote is ready.`,

    // WAITING_FOR_QUOTE state
    WAITING_FOR_QUOTE:
      "Your application is under review. We will contact you as soon as your quote is ready. Thank you for your patience!",

    // QUOTE_REVIEW state
    QUOTE_REVIEW_HEADER: "Your finance quote:\n\n",
    QUOTE_ACCEPT_BUTTON: "Accept quote",
    QUOTE_DECLINE_BUTTON: "Decline",
    QUOTE_REVIEW_QUESTION: "Would you like to proceed with this quote?",
    QUOTE_ACCEPTED:
      "Quote accepted!\n\nWe are preparing your loan agreement. You will receive a secure signing link shortly. Please review and sign the contract at your earliest convenience.",
    QUOTE_DECLINED:
      "Thank you for considering VehicleFinance. You have declined this quote. If you would like a new quote in future, please start a new conversation. Goodbye!",

    // QUOTE_REVIEW — tool-layer presentation (present_quote tool)
    QUOTE_TOOL_MESSAGE: (monthly: number, term: number, rate: number, total: number) =>
      `Great news! Your finance quote is ready:\n\n` +
      `Monthly instalment: R${monthly.toLocaleString('en-ZA')}\n` +
      `Term: ${term} months\n` +
      `Interest rate: ${rate}% per annum\n` +
      `Total repayable: R${total.toLocaleString('en-ZA')}\n\n` +
      `Reply *ACCEPT* to accept this offer or *DECLINE* to decline.`,

    // CONTRACT_SIGNING state
    CONTRACT_SIGNING_PROMPT:
      "Please sign the contract using the link we sent you. Once signed, reply *Signed* here to confirm. If you have not received the link, please reply *Resend*.",
    CONTRACT_SIGNED:
      "Congratulations! Your contract has been signed and your finance application is being finalised.\n\nA consultant will be in touch within 1 business day to complete the disbursement process. Thank you for choosing VehicleFinance!",

    // DONE state
    DONE_MESSAGE:
      "Your application is complete. For any further queries, please contact our support team. Thank you!",
  },

  // ── Seller flow ──────────────────────────────────────────────────────────

  SELLER: {
    // WELCOME state
    WELCOME_INTRO:
      "Welcome to VehicleFinance!\n\nA buyer has requested vehicle finance and has provided your WhatsApp number as the seller.\n\nWe need to collect some documentation from you to proceed with the transaction.",
    WELCOME_CONSENT_QUESTION:
      "Do you consent to our Terms of Service and Privacy Policy, and agree for us to process your personal information for the purposes of this vehicle sale transaction?",
    WELCOME_CONSENT_YES: "Yes, I agree",
    WELCOME_CONSENT_NO: "No, decline",

    // CONSENT state
    CONSENT_DECLINED:
      "No problem. The buyer will be notified that the seller has declined to participate. If you change your mind, feel free to message us again.",
    CONSENT_ACCEPTED_ID_PROMPT:
      "Thank you!\n\n*Step 1 of 3 — Identity Document*\n\nPlease send a clear photo or PDF of your South African ID document (green bar-coded ID, Smart ID card, or Passport).",

    // ID_UPLOAD state
    ID_UPLOAD_PROMPT:
      "Please send your ID document as a *photo* or *PDF file*. Make sure all four corners are visible and the text is legible.",
    ID_UPLOAD_RECEIVED:
      "ID document received!\n\n*Step 2 of 3 — Vehicle Documentation*\n\nPlease send the vehicle's *Registration Certificate (RC1/natis)* as a photo or PDF.",

    // VEHICLE_DOC_UPLOAD state
    VEHICLE_DOC_PROMPT:
      "Please send the vehicle's *Registration Certificate (natis/RC1)* as a *photo* or *PDF file*.",
    VEHICLE_DOC_RECEIVED: (angleList: string) =>
      `Vehicle document received!\n\n*Step 3 of 3 — Vehicle Photos*\n\nWe need *9 photos* of the vehicle to complete the inspection.\n\nRequired photos:\n${angleList}\n\nPlease send each photo one at a time. Start with: *Front view (straight on)*`,

    // VEHICLE_PHOTOS state
    PHOTO_PROMPT_GENERIC: "Please send the next vehicle photo.",
    PHOTO_RECEIVED: (count: number, angleLabel: string | null, nextLabel: string, remaining: number) =>
      `Photo ${count}/9 received${angleLabel ? ` (${angleLabel})` : ""}\n\nNext photo needed: *${nextLabel}*\n\n${remaining} photo(s) remaining.`,
    ALL_PHOTOS_RECEIVED:
      "All 9 vehicle photos received!\n\nI am now extracting the vehicle details from your documents. Please hold on for a moment...",

    // DATA_CONFIRMATION state
    DATA_CONFIRM_HEADER: "Here is the vehicle information we extracted:\n\n",
    DATA_CONFIRM_PENDING: "_(Data extraction in progress — please wait a moment and try again)_",
    DATA_CONFIRM_QUESTION: "Is all the vehicle information above correct?",
    DATA_CONFIRM_YES: "Yes, correct",
    DATA_CONFIRM_NO: "Something is wrong",
    DATA_CONFIRM_CORRECTION_REQUEST:
      "I'm sorry about that. Please describe what is incorrect and a consultant will assist you to update the information.",
    DATA_CONFIRMED:
      "Vehicle information confirmed!\n\nThe buyer's finance application is being processed. Once approved, you will receive a sale agreement to sign.\n\nWe will notify you on WhatsApp when the contract is ready.",

    // WAITING_FOR_CONTRACT state
    WAITING_FOR_CONTRACT:
      "The contract is being prepared. We will notify you here as soon as it is ready to sign. Thank you for your patience!",

    // CONTRACT_SIGNING state
    CONTRACT_SIGNING_PROMPT:
      "Please sign the sale agreement using the link we sent you. Once signed, reply *Signed* here to confirm. If you have not received the link, reply *Resend*.",
    CONTRACT_SIGNED:
      "Congratulations! You have signed the sale agreement. The finance will be disbursed to the buyer and the vehicle transfer process will begin.\n\nA consultant will contact you with further instructions. Thank you for using VehicleFinance!",

    // DONE state
    DONE_MESSAGE:
      "This transaction is complete. For further queries, please contact our support team. Thank you!",

    // Seller onboarding message (sent from tool-handlers layer when buyer captures seller details)
    ONBOARDING_INTRO: (sellerName: string) =>
      `Hi ${sellerName}! A buyer has applied for vehicle finance to purchase your vehicle. ` +
      `I am your vehicle finance assistant and will guide you through the process right here on WhatsApp. ` +
      `It only takes about 10 minutes. Please send any message to get started.`,

    // Reminder messages
    REMINDER_PREFIX_2H: "Just a gentle reminder:",
    REMINDER_PREFIX_24H: "We noticed you have not continued your application. Reminder:",
    REMINDER_PREFIX_48H:
      "Final reminder: Your vehicle transaction is waiting on your action.",
  },
};
