/**
 * SendGrid email notification service.
 *
 * Docs: https://docs.sendgrid.com/api-reference/mail-send
 *
 * Environment variables required:
 *   SENDGRID_API_KEY    — SendGrid API key (starts with 'SG.')
 *   SENDGRID_FROM_EMAIL — verified sender address, e.g. "noreply@vehiclefinance.co.za"
 */

import sgMail from '@sendgrid/mail';

const log = (level: 'info' | 'error', msg: string, data?: unknown) => {
  const entry = { ts: new Date().toISOString(), service: 'sendgrid', level, msg, data };
  if (level === 'error') {
    console.error(JSON.stringify(entry));
  } else {
    console.log(JSON.stringify(entry));
  }
};

function initClient(): void {
  const apiKey = process.env.SENDGRID_API_KEY;
  if (!apiKey) throw new Error('Missing required env var: SENDGRID_API_KEY');
  sgMail.setApiKey(apiKey);
}

function senderAddress(): string {
  const from = process.env.SENDGRID_FROM_EMAIL;
  if (!from) throw new Error('Missing required env var: SENDGRID_FROM_EMAIL');
  return from;
}

/**
 * Send a transactional email with inline HTML (and optional plain-text fallback).
 *
 * @param to       - Recipient email address
 * @param subject  - Email subject line
 * @param htmlBody - Full HTML content
 * @param textBody - Optional plain-text fallback (auto-stripped from HTML if omitted)
 */
export async function sendEmail(
  to: string,
  subject: string,
  htmlBody: string,
  textBody?: string,
): Promise<void> {
  initClient();
  log('info', 'sendEmail', { to, subject });

  try {
    await sgMail.send({
      to,
      from: senderAddress(),
      subject,
      html: htmlBody,
      ...(textBody ? { text: textBody } : {}),
    });
    log('info', 'sendEmail success', { to });
  } catch (err) {
    log('error', 'sendEmail failed', { to, subject, err });
    throw err;
  }
}

/**
 * Send an email using a SendGrid dynamic template.
 *
 * @param to          - Recipient email address
 * @param templateId  - SendGrid template ID (e.g. "d-abc123…")
 * @param dynamicData - Key-value pairs injected into the template via Handlebars
 */
export async function sendTemplateEmail(
  to: string,
  templateId: string,
  dynamicData: Record<string, unknown>,
): Promise<void> {
  initClient();
  log('info', 'sendTemplateEmail', { to, templateId });

  try {
    await sgMail.send({
      to,
      from: senderAddress(),
      templateId,
      dynamicTemplateData: dynamicData,
    });
    log('info', 'sendTemplateEmail success', { to, templateId });
  } catch (err) {
    log('error', 'sendTemplateEmail failed', { to, templateId, err });
    throw err;
  }
}
