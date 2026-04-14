/**
 * Outbound notification handler.
 *
 * All notification functions attempt to send via WhatsApp (Dialog360) first.
 * If the WhatsApp send fails, BulkSMS is used as an SMS fallback.
 * SendGrid is used for email notifications where an email address is available.
 */

import {
  sendTextMessage,
  sendInteractiveMessage,
} from '../services/dialog360.js';
import { sendSMS } from '../services/bulksms.js';
import { sendTemplateEmail } from '../services/sendgrid.js';
import { getDeal, createAuditEvent } from '../services/supabase.js';
import type { QuoteData, ReminderType } from '../types/index.js';

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

const log = (level: 'info' | 'warn' | 'error', msg: string, data?: unknown) => {
  const entry = { ts: new Date().toISOString(), handler: 'notifications', level, msg, data };
  if (level === 'error') console.error(JSON.stringify(entry));
  else if (level === 'warn') console.warn(JSON.stringify(entry));
  else console.log(JSON.stringify(entry));
};

// ---------------------------------------------------------------------------
// Fallback helpers
// ---------------------------------------------------------------------------

/** Send via WhatsApp; fall back to SMS on failure. */
async function sendWithFallback(phone: string, message: string): Promise<void> {
  try {
    await sendTextMessage(phone, message);
  } catch (waErr) {
    log('warn', 'WhatsApp send failed, falling back to SMS', { phone, error: waErr });
    try {
      await sendSMS(phone, message);
    } catch (smsErr) {
      log('error', 'SMS fallback also failed', { phone, error: smsErr });
      throw smsErr;
    }
  }
}

// ---------------------------------------------------------------------------
// Public notification functions
// ---------------------------------------------------------------------------

/**
 * Send a finance quote to the buyer via WhatsApp interactive message.
 * Also dispatches an email notification if the buyer's email is available.
 *
 * @param dealId    - UUID of the deal
 * @param quoteData - Quote details to present to the buyer
 */
export async function sendQuoteToBuyer(dealId: string, quoteData: QuoteData): Promise<void> {
  log('info', 'sendQuoteToBuyer', { dealId });

  const deal = await getDeal(dealId);
  if (!deal) throw new Error(`Deal not found: ${dealId}`);

  const phone = deal.buyer_phone as string;

  const quoteMessage =
    `🎉 *Your Vehicle Finance Quote is Ready!*\n\n` +
    `Deal reference: ${dealId.slice(0, 8).toUpperCase()}\n\n` +
    `💰 Loan amount: *R${quoteData.loanAmount.toLocaleString()}*\n` +
    `📊 Interest rate: *${quoteData.interestRate}% p.a.*\n` +
    `📅 Term: *${quoteData.termMonths} months*\n` +
    `📆 Monthly instalment: *R${quoteData.monthlyInstalment.toLocaleString()}*\n` +
    `💵 Total repayable: *R${quoteData.totalRepayable.toLocaleString()}*\n\n` +
    `Quote valid until: ${new Date(quoteData.expiresAt).toLocaleDateString('en-ZA')}`;

  try {
    await sendInteractiveMessage(
      phone,
      quoteMessage,
      [
        { id: 'quote_accept', title: 'Accept quote' },
        { id: 'quote_decline', title: 'Decline' },
      ],
      'Finance Quote',
    );
  } catch (err) {
    log('warn', 'WhatsApp quote send failed, falling back to SMS', { phone });
    const smsFriendly =
      `VehicleFinance Quote: R${quoteData.loanAmount.toLocaleString()} over ${quoteData.termMonths} months @ R${quoteData.monthlyInstalment.toLocaleString()}/mo. Reply YES to accept or NO to decline. Ref: ${dealId.slice(0, 8).toUpperCase()}`;
    await sendSMS(phone, smsFriendly);
  }

  // Email notification if available
  const buyerEmail = deal.buyer_email as string | undefined;
  if (buyerEmail) {
    const templateId = process.env.SENDGRID_QUOTE_TEMPLATE_ID;
    if (templateId) {
      await sendTemplateEmail(buyerEmail, templateId, {
        dealId,
        dealRef: dealId.slice(0, 8).toUpperCase(),
        loanAmount: quoteData.loanAmount.toLocaleString(),
        interestRate: quoteData.interestRate,
        termMonths: quoteData.termMonths,
        monthlyInstalment: quoteData.monthlyInstalment.toLocaleString(),
        totalRepayable: quoteData.totalRepayable.toLocaleString(),
        expiresAt: new Date(quoteData.expiresAt).toLocaleDateString('en-ZA'),
      }).catch((emailErr) => {
        log('warn', 'Quote email failed (non-fatal)', { buyerEmail, error: emailErr });
      });
    }
  }

  await createAuditEvent(dealId, 'quote_sent', 'bot', { quoteData });
}

/**
 * Send a contract signing link to a party.
 *
 * @param phone        - Recipient's E.164 phone number
 * @param contractUrl  - Secure URL to the signing portal
 * @param contractType - 'loan_agreement' | 'sale_agreement'
 * @param dealId       - Associated deal UUID (for audit log)
 */
export async function sendContractLink(
  phone: string,
  contractUrl: string,
  contractType: 'loan_agreement' | 'sale_agreement',
  dealId?: string,
): Promise<void> {
  log('info', 'sendContractLink', { phone, contractType });

  const label = contractType === 'loan_agreement' ? 'Loan Agreement' : 'Sale Agreement';

  const message =
    `📝 *Your ${label} is ready to sign.*\n\n` +
    `Please open the link below, review the document carefully, and sign electronically:\n\n` +
    `${contractUrl}\n\n` +
    `Once signed, reply *Signed* to confirm.\n\n` +
    `⚠️ This link is secure and personal — please do not share it.`;

  await sendWithFallback(phone, message);

  if (dealId) {
    await createAuditEvent(dealId, 'contract_link_sent', 'bot', { contractType, phone });
  }
}

/**
 * Send a generic status update to a party.
 *
 * @param phone         - Recipient's E.164 phone number
 * @param dealId        - Deal reference
 * @param statusMessage - Human-readable status text
 */
export async function sendStatusUpdate(
  phone: string,
  dealId: string,
  statusMessage: string,
): Promise<void> {
  log('info', 'sendStatusUpdate', { phone, dealId });

  const message =
    `ℹ️ *VehicleFinance Update*\n\n` +
    `Ref: ${dealId.slice(0, 8).toUpperCase()}\n\n` +
    statusMessage;

  await sendWithFallback(phone, message);
  await createAuditEvent(dealId, 'status_update_sent', 'bot', { phone, statusMessage });
}

/**
 * Send a reminder to a party who has been idle.
 *
 * @param phone        - Recipient's E.164 phone number
 * @param reminderType - Nature of the reminder
 * @param context      - Additional context for personalising the message
 */
export async function sendReminder(
  phone: string,
  reminderType: ReminderType,
  context: Record<string, unknown> = {},
): Promise<void> {
  log('info', 'sendReminder', { phone, reminderType });

  const messages: Record<ReminderType, string> = {
    upload_pending:
      `👋 Hi! We noticed you haven't finished uploading your documents.\n\n` +
      `Your vehicle finance application is still waiting. Please send your documents to continue.\n\n` +
      `Reply here to pick up where you left off.`,
    quote_pending:
      `📋 Your finance quote is ready and waiting for your response!\n\n` +
      `Please review the quote we sent and reply *Accept* or *Decline*.\n\n` +
      `The quote ${context.expiresAt ? `expires on ${context.expiresAt}` : 'has a limited validity period'}.`,
    contract_pending:
      `📝 Your contract is ready to sign!\n\n` +
      `Please use the signing link we sent and reply *Signed* once completed.\n\n` +
      `${context.contractUrl ? `Signing link: ${context.contractUrl}` : 'If you need the link resent, reply *Resend*.'}`,
    generic:
      `👋 Hi! Your VehicleFinance transaction requires your attention.\n\n` +
      `Please reply here to continue where you left off.`,
  };

  const messageText = messages[reminderType];

  await sendWithFallback(phone, messageText);

  if (context.dealId) {
    await createAuditEvent(context.dealId as string, 'reminder_sent', 'bot', {
      phone,
      reminderType,
    });
  }
}

/**
 * Notify both parties that a deal has been disbursed.
 *
 * @param dealId - UUID of the completed deal
 */
export async function sendDisbursementNotifications(dealId: string): Promise<void> {
  log('info', 'sendDisbursementNotifications', { dealId });

  const deal = await getDeal(dealId);
  if (!deal) throw new Error(`Deal not found: ${dealId}`);

  const ref = dealId.slice(0, 8).toUpperCase();

  const buyerMessage =
    `🎉 *Congratulations!*\n\n` +
    `Your vehicle finance (Ref: ${ref}) has been approved and funds have been disbursed.\n\n` +
    `Please contact the seller to arrange vehicle collection. Welcome to VehicleFinance! 🚗`;

  const sellerMessage =
    `💰 *Payment Notification*\n\n` +
    `Your vehicle sale (Ref: ${ref}) has been finalised. Payment has been processed.\n\n` +
    `Please arrange vehicle handover with the buyer. Thank you for using VehicleFinance!`;

  await Promise.allSettled([
    sendWithFallback(deal.buyer_phone as string, buyerMessage),
    deal.seller_phone
      ? sendWithFallback(deal.seller_phone as string, sellerMessage)
      : Promise.resolve(),
  ]);

  await createAuditEvent(dealId, 'disbursement_notifications_sent', 'bot', {});
}
