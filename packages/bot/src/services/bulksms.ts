import axios from 'axios';

const TOKEN_ID = process.env.BULKSMS_TOKEN_ID!;
const TOKEN_SECRET = process.env.BULKSMS_TOKEN_SECRET!;
const BASE_URL = 'https://api.bulksms.com/v1';

export async function sendSMS(phone: string, message: string): Promise<void> {
  await axios.post(
    `${BASE_URL}/messages`,
    {
      to: phone,
      body: message,
    },
    {
      auth: { username: TOKEN_ID, password: TOKEN_SECRET },
      headers: { 'Content-Type': 'application/json' },
    },
  );
}
