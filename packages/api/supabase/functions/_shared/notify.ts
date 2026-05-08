// Minimal SMS / email shims for the edge-function port.
// Uses fetch (not axios / @sendgrid/mail).
//
// Both helpers no-op if their secrets are absent so dev deployments still work.

export async function sendSMS(phone: string, message: string): Promise<void> {
  const tokenId = Deno.env.get("BULKSMS_TOKEN_ID")
  const tokenSecret = Deno.env.get("BULKSMS_TOKEN_SECRET")
  if (!tokenId || !tokenSecret) {
    console.warn("[bulksms] secrets missing — skipping send", { phone })
    return
  }
  const normalised = phone.startsWith("+") ? phone.slice(1) : phone
  const auth = btoa(`${tokenId}:${tokenSecret}`)
  const res = await fetch("https://api.bulksms.com/v1/messages", {
    method: "POST",
    headers: {
      "Authorization": `Basic ${auth}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify([{ to: normalised, body: message }]),
  })
  if (!res.ok) {
    const txt = (await res.text()).slice(0, 300)
    throw new Error(`BulkSMS ${res.status}: ${txt}`)
  }
}

export async function sendEmail(to: string, subject: string, htmlBody: string): Promise<void> {
  const apiKey = Deno.env.get("SENDGRID_API_KEY")
  const fromEmail = Deno.env.get("SENDGRID_FROM_EMAIL") ?? Deno.env.get("SENDGRID_FROM")
  if (!apiKey || !fromEmail) {
    console.warn("[sendgrid] secrets missing — skipping send", { to })
    return
  }
  const fromName = Deno.env.get("SENDGRID_FROM_NAME") ?? "Vehicle Finance"
  const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to }] }],
      from: { email: fromEmail, name: fromName },
      subject,
      content: [{ type: "text/html", value: htmlBody }],
    }),
  })
  if (!res.ok) {
    const txt = (await res.text()).slice(0, 300)
    throw new Error(`SendGrid ${res.status}: ${txt}`)
  }
}
