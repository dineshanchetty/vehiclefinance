/**
 * BulkSMS SMS notification service.
 *
 * Docs: https://www.bulksms.com/developer/
 * Authentication: HTTP Basic (token ID + token secret).
 *
 * Environment variables required:
 *   BULKSMS_TOKEN_ID      — token ID from BulkSMS portal
 *   BULKSMS_TOKEN_SECRET  — token secret from BulkSMS portal
 */

import axios from 'axios';

const BULKSMS_BASE_URL = 'https://api.bulksms.com/v1';

const log = (level: 'info' | 'error', msg: string, data?: unknown) => {
  const entry = { ts: new Date().toISOString(), service: 'bulksms', level, msg, data };
  if (level === 'error') {
    console.error(JSON.stringify(entry));
  } else {
    console.log(JSON.stringify(entry));
  }
};

interface BulkSmsMessage {
  to: string;
  body: string;
}

interface BulkSmsResponse {
  id: string;
  type: string;
  status: { id: string; type: string };
  creditCost: number;
}

/**
 * Send a single SMS via BulkSMS.
 *
 * @param phone   - E.164 phone number, e.g. "+27821234567" or "27821234567"
 * @param message - SMS body text (max 160 chars for single SMS, longer auto-segmented)
 */
export async function sendSMS(phone: string, message: string): Promise<void> {
  const tokenId = process.env.BULKSMS_TOKEN_ID;
  const tokenSecret = process.env.BULKSMS_TOKEN_SECRET;

  if (!tokenId || !tokenSecret) {
    throw new Error('Missing required env vars: BULKSMS_TOKEN_ID, BULKSMS_TOKEN_SECRET');
  }

  // Normalise to E.164 (strip leading '+' if present — BulkSMS accepts both)
  const normalisedPhone = phone.startsWith('+') ? phone.slice(1) : phone;

  const payload: BulkSmsMessage = { to: normalisedPhone, body: message };

  log('info', 'sendSMS', { phone: normalisedPhone });

  try {
    const res = await axios.post<BulkSmsResponse[]>(`${BULKSMS_BASE_URL}/messages`, [payload], {
      auth: { username: tokenId, password: tokenSecret },
      headers: { 'Content-Type': 'application/json' },
      timeout: 10_000,
    });

    const result = res.data[0];
    log('info', 'sendSMS success', { id: result?.id, status: result?.status?.id });
  } catch (err) {
    log('error', 'sendSMS failed', { phone: normalisedPhone, err });
    throw err;
  }
}
