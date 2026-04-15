import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { getSupabaseClient } from "../_shared/supabase.ts"
import { sendWhatsAppMessage, textMessage } from "../_shared/dialog360.ts"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type NotificationChannel = "WHATSAPP" | "SMS" | "EMAIL"

type NotificationTemplate =
  | "QUOTE_READY"
  | "QUOTE_ACCEPTED"
  | "CONTRACT_READY"
  | "CONTRACT_SIGNED"
  | "DEAL_APPROVED"
  | "STATUS_UPDATE"
  | "REMINDER_2H"
  | "REMINDER_24H"
  | "REMINDER_48H"
  | "NATIS_COMPLETE"

interface SendNotificationRequest {
  deal_id: string
  recipient_phone?: string
  recipient_email?: string
  channel: NotificationChannel
  template: NotificationTemplate
  data?: Record<string, string>
}

// ---------------------------------------------------------------------------
// Template rendering
// ---------------------------------------------------------------------------

function renderTemplate(template: NotificationTemplate, data: Record<string, string> = {}): string {
  const d = (key: string, fallback = "") => data[key] ?? fallback

  switch (template) {
    case "QUOTE_READY":
      return `Hi ${d("name", "there")} 👋\n\nYour vehicle finance quote is ready!\n\n*Deal:* ${d("deal_ref")}\n*Monthly installment:* R ${d("monthly_installment")}\n*Term:* ${d("term_months")} months\n*Interest rate:* ${d("interest_rate")}%\n\nReply *ACCEPT* to proceed or *DECLINE* if you'd like to reconsider.\n\nThis quote is valid for 48 hours.`

    case "QUOTE_ACCEPTED":
      return `Great news! ✅\n\nYour quote for deal *${d("deal_ref")}* has been accepted.\n\nWe're now preparing your contract. You'll receive a signing link shortly.\n\nThank you for choosing VehicleFinance!`

    case "CONTRACT_READY":
      return `Your contract is ready to sign! 📝\n\n*Deal:* ${d("deal_ref")}\n\nPlease sign your contract here:\n${d("signing_url")}\n\nThis link expires in ${d("expiry_hours", "24")} hours. Contact us if you need assistance.`

    case "CONTRACT_SIGNED":
      return `Contract signed successfully! 🎉\n\n*Deal:* ${d("deal_ref")}\n\nYour vehicle finance deal is now in final approval. We'll notify you within ${d("approval_hours", "24")} hours.\n\nThank you!`

    case "DEAL_APPROVED":
      return `Congratulations! Your deal is APPROVED! 🚗💚\n\n*Deal:* ${d("deal_ref")}\n\nNext steps:\n1. ${d("next_step_1", "You will be contacted to arrange vehicle collection")}\n2. ${d("next_step_2", "NATIS transfer will be processed")}\n\nWelcome to VehicleFinance!`

    case "STATUS_UPDATE":
      return `Update on your deal *${d("deal_ref")}* 📋\n\nStatus: *${d("status")}*\n\n${d("message", "No additional details.")}`

    case "REMINDER_2H":
      return `Reminder ⏰\n\nYou have a pending action on deal *${d("deal_ref")}* that expires in *2 hours*.\n\n${d("action", "Please complete your pending action.")}`

    case "REMINDER_24H":
      return `Reminder ⏰\n\nYou have a pending action on deal *${d("deal_ref")}* that expires in *24 hours*.\n\n${d("action", "Please complete your pending action.")}`

    case "REMINDER_48H":
      return `Reminder ⏰\n\nYou have a pending action on deal *${d("deal_ref")}* that expires in *48 hours*.\n\n${d("action", "Please complete your pending action.")}`

    case "NATIS_COMPLETE":
      return `NATIS transfer complete! 🏁\n\n*Deal:* ${d("deal_ref")}\n*Vehicle:* ${d("vehicle_description")}\n\nThe vehicle is now registered in your name. Congratulations and enjoy your new vehicle!\n\nThank you for using VehicleFinance.`

    default:
      return `Notification from VehicleFinance regarding deal ${d("deal_ref")}.`
  }
}

// ---------------------------------------------------------------------------
// Email rendering (HTML)
// ---------------------------------------------------------------------------

function renderEmailSubject(template: NotificationTemplate, data: Record<string, string>): string {
  const dealRef = data.deal_ref ?? "your deal"
  switch (template) {
    case "QUOTE_READY": return `Your Vehicle Finance Quote is Ready — ${dealRef}`
    case "QUOTE_ACCEPTED": return `Quote Accepted — ${dealRef}`
    case "CONTRACT_READY": return `Your Contract is Ready to Sign — ${dealRef}`
    case "CONTRACT_SIGNED": return `Contract Signed — ${dealRef}`
    case "DEAL_APPROVED": return `Your Deal Has Been Approved! — ${dealRef}`
    case "STATUS_UPDATE": return `Deal Status Update — ${dealRef}`
    case "REMINDER_2H": return `Action Required (2 hour reminder) — ${dealRef}`
    case "REMINDER_24H": return `Action Required (24 hour reminder) — ${dealRef}`
    case "REMINDER_48H": return `Action Required (48 hour reminder) — ${dealRef}`
    case "NATIS_COMPLETE": return `NATIS Transfer Complete — ${dealRef}`
    default: return `VehicleFinance Notification — ${dealRef}`
  }
}

// ---------------------------------------------------------------------------
// Channel senders
// ---------------------------------------------------------------------------

async function sendViaSMS(
  phone: string,
  message: string,
  tokenId: string,
  tokenSecret: string
): Promise<void> {
  const credentials = btoa(`${tokenId}:${tokenSecret}`)
  const res = await fetch("https://api.bulksms.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${credentials}`,
    },
    body: JSON.stringify([{ to: phone, body: message }]),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`BulkSMS failed (${res.status}): ${body}`)
  }
}

async function sendViaEmail(
  toEmail: string,
  subject: string,
  textBody: string,
  apiKey: string
): Promise<void> {
  const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: toEmail }] }],
      from: { email: "noreply@vehiclefinance.co.za", name: "VehicleFinance" },
      subject,
      content: [
        { type: "text/plain", value: textBody },
        {
          type: "text/html",
          value: `<html><body><pre style="font-family:sans-serif;white-space:pre-wrap">${textBody.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</pre></body></html>`,
        },
      ],
    }),
  })
  if (!res.ok && res.status !== 202) {
    const body = await res.text()
    throw new Error(`SendGrid failed (${res.status}): ${body}`)
  }
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 })
  }

  let body: SendNotificationRequest
  try {
    body = await req.json()
  } catch {
    return new Response("Bad Request: invalid JSON", { status: 400 })
  }

  const { deal_id, recipient_phone, recipient_email, channel, template, data = {} } = body

  if (!deal_id || !channel || !template) {
    return new Response("Bad Request: missing required fields", { status: 400 })
  }

  const supabase = getSupabaseClient()

  // Create notification record
  const { data: notification, error: insertError } = await supabase
    .from("notifications")
    .insert({
      deal_id,
      recipient_phone: recipient_phone ?? null,
      recipient_email: recipient_email ?? null,
      channel,
      template,
      template_data: data,
      status: "PENDING",
    })
    .select("id")
    .single()

  if (insertError) {
    return new Response(
      JSON.stringify({ error: `Failed to create notification: ${insertError.message}` }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    )
  }

  const notificationId = notification.id
  const message = renderTemplate(template, data)

  try {
    switch (channel) {
      case "WHATSAPP": {
        if (!recipient_phone) throw new Error("recipient_phone required for WhatsApp")
        await sendWhatsAppMessage(textMessage(recipient_phone, message))
        break
      }

      case "SMS": {
        if (!recipient_phone) throw new Error("recipient_phone required for SMS")
        const tokenId = Deno.env.get("BULKSMS_TOKEN_ID")!
        const tokenSecret = Deno.env.get("BULKSMS_TOKEN_SECRET")!
        await sendViaSMS(recipient_phone, message, tokenId, tokenSecret)
        break
      }

      case "EMAIL": {
        if (!recipient_email) throw new Error("recipient_email required for email")
        const apiKey = Deno.env.get("SENDGRID_API_KEY")!
        const subject = renderEmailSubject(template, data)
        await sendViaEmail(recipient_email, subject, message, apiKey)
        break
      }

      default:
        throw new Error(`Unsupported channel: ${channel}`)
    }

    // Update notification status to SENT
    await supabase
      .from("notifications")
      .update({ status: "SENT", sent_at: new Date().toISOString() })
      .eq("id", notificationId)

    // Audit log
    await supabase.from("audit_logs").insert({
      deal_id,
      event_type: "NOTIFICATION_SENT",
      actor: "system:send-notification",
      metadata: { notification_id: notificationId, channel, template },
    })

    return new Response(
      JSON.stringify({ success: true, notification_id: notificationId }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    )
  } catch (err) {
    console.error("send-notification error:", err)

    await supabase
      .from("notifications")
      .update({ status: "FAILED", error_message: String(err) })
      .eq("id", notificationId)

    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    )
  }
})
