import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { getSupabaseClient } from "../_shared/supabase.ts"
import { sendWhatsAppMessage, downloadMedia, textMessage } from "../_shared/dialog360.ts"
import {
  createMessage,
  extractToolUses,
  extractText,
  type Message,
  type Tool,
  type ContentBlock,
  type ContentBlockToolResult,
} from "../_shared/anthropic.ts"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface D360WebhookPayload {
  statuses?: D360Status[]
  messages?: D360IncomingMessage[]
  contacts?: Array<{ profile: { name: string }; wa_id: string }>
}

interface D360Status {
  id: string
  status: "sent" | "delivered" | "read" | "failed"
  timestamp: string
  recipient_id: string
}

interface D360IncomingMessage {
  from: string
  id: string
  timestamp: string
  type: "text" | "image" | "document" | "audio" | "video" | "location" | "contacts"
  text?: { body: string }
  image?: { id: string; mime_type: string; sha256: string; caption?: string }
  document?: { id: string; filename: string; mime_type: string; sha256: string }
}

// ---------------------------------------------------------------------------
// Bot tools definitions
// ---------------------------------------------------------------------------

const BOT_TOOLS: Tool[] = [
  {
    name: "query_deal",
    description: "Look up deal information by deal_id or phone number.",
    input_schema: {
      type: "object",
      properties: {
        deal_id: { type: "string", description: "UUID of the deal" },
        phone: { type: "string", description: "Phone number of the buyer/seller" },
      },
    },
  },
  {
    name: "update_deal_status",
    description: "Update the status of a deal.",
    input_schema: {
      type: "object",
      required: ["deal_id", "status"],
      properties: {
        deal_id: { type: "string" },
        status: { type: "string", description: "New deal status" },
        notes: { type: "string" },
      },
    },
  },
  {
    name: "store_document",
    description: "Record a document after it has been uploaded to storage.",
    input_schema: {
      type: "object",
      required: ["deal_id", "doc_type", "storage_path", "original_filename"],
      properties: {
        deal_id: { type: "string" },
        doc_type: {
          type: "string",
          enum: ["ID_DOCUMENT", "PROOF_OF_ADDRESS", "BANK_STATEMENT", "NATIS", "OTHER"],
        },
        storage_path: { type: "string" },
        original_filename: { type: "string" },
        uploaded_by: { type: "string", enum: ["buyer", "seller"] },
      },
    },
  },
  {
    name: "get_extraction_results",
    description: "Retrieve document extraction results for a deal.",
    input_schema: {
      type: "object",
      required: ["deal_id"],
      properties: {
        deal_id: { type: "string" },
        doc_type: { type: "string" },
      },
    },
  },
  {
    name: "send_whatsapp_message",
    description: "Send a WhatsApp text message to a phone number.",
    input_schema: {
      type: "object",
      required: ["to", "body"],
      properties: {
        to: { type: "string", description: "E.164 phone number" },
        body: { type: "string", description: "Message text" },
      },
    },
  },
  {
    name: "get_photo_progress",
    description: "Get the current photo upload progress for a vehicle in a deal.",
    input_schema: {
      type: "object",
      required: ["deal_id"],
      properties: { deal_id: { type: "string" } },
    },
  },
  {
    name: "create_task",
    description: "Create a task in the internal work queue.",
    input_schema: {
      type: "object",
      required: ["queue_name", "deal_id", "title"],
      properties: {
        queue_name: {
          type: "string",
          enum: [
            "Q_BUYER_DOC_REVIEW",
            "Q_SELLER_DOC_REVIEW",
            "Q_SELLER_PHOTO_REVIEW",
            "Q_FNI_QUOTE",
            "Q_CONTRACT_PREP",
            "Q_NATIS_TRANSFER",
          ],
        },
        deal_id: { type: "string" },
        title: { type: "string" },
        description: { type: "string" },
        priority: { type: "string", enum: ["LOW", "NORMAL", "HIGH", "URGENT"] },
      },
    },
  },
  {
    name: "log_audit",
    description: "Log an audit event for compliance.",
    input_schema: {
      type: "object",
      required: ["deal_id", "event_type", "actor"],
      properties: {
        deal_id: { type: "string" },
        event_type: { type: "string" },
        actor: { type: "string" },
        metadata: { type: "object" },
      },
    },
  },
]

const SYSTEM_PROMPT = `You are the VehicleFinance WhatsApp bot assistant. You help buyers and sellers navigate the vehicle finance deal process.

## Buyer Journey
1. Buyer sends first message → welcome, ask for ID number and full name
2. Collect: ID document (photo), Proof of address, 3 months bank statements
3. Once docs received → acknowledge, explain next steps (AI review then FNI quote)
4. Quote sent → explain terms, ask for acceptance/decline
5. Quote accepted → contract signing link sent
6. Contract signed → congrats, explain what happens next

## Seller Journey
1. Seller sends first message → welcome, explain photo requirements
2. Collect 9 mandatory photos: front, rear, driver_side, passenger_side, interior_front, interior_rear, engine_bay, odometer, vin_plate
3. Once all 9 photos → acknowledge, explain AI assessment
4. Assessment complete → share summary with seller
5. NATIS transfer instructions → guide through process

## General Rules
- Always be polite, professional, and empathetic
- Keep messages concise for WhatsApp (no walls of text)
- Always use the log_audit tool for significant events
- If a user seems confused or asks for human help, create a task with priority HIGH
- Never share one party's information with the other
- Always confirm before taking status-changing actions`

// ---------------------------------------------------------------------------
// Tool execution
// ---------------------------------------------------------------------------

async function executeTool(
  supabase: ReturnType<typeof getSupabaseClient>,
  toolName: string,
  input: Record<string, unknown>
): Promise<string> {
  try {
    switch (toolName) {
      case "query_deal": {
        let q = supabase.from("deals").select("*")
        if (input.deal_id) q = q.eq("id", input.deal_id as string)
        else if (input.phone) {
          const { data: buyer } = await supabase
            .from("buyers")
            .select("deal_id")
            .eq("phone", input.phone as string)
            .single()
          if (buyer) q = q.eq("id", buyer.deal_id)
          else return JSON.stringify({ error: "No deal found for this phone" })
        }
        const { data, error } = await q.single()
        if (error) return JSON.stringify({ error: error.message })
        return JSON.stringify(data)
      }

      case "update_deal_status": {
        const { error } = await supabase
          .from("deals")
          .update({
            status: input.status as string,
            ...(input.notes ? { notes: input.notes } : {}),
            updated_at: new Date().toISOString(),
          })
          .eq("id", input.deal_id as string)
        if (error) return JSON.stringify({ error: error.message })
        return JSON.stringify({ success: true })
      }

      case "store_document": {
        const { data, error } = await supabase
          .from("documents")
          .insert({
            deal_id: input.deal_id,
            doc_type: input.doc_type,
            storage_path: input.storage_path,
            original_filename: input.original_filename,
            uploaded_by: input.uploaded_by ?? "buyer",
            status: "UPLOADED",
          })
          .select("id")
          .single()
        if (error) return JSON.stringify({ error: error.message })
        return JSON.stringify({ document_id: data.id })
      }

      case "get_extraction_results": {
        let q = supabase
          .from("extraction_results")
          .select("*, documents(doc_type)")
          .eq("deal_id", input.deal_id as string)
        if (input.doc_type) {
          // join filter via documents table
          const { data: docs } = await supabase
            .from("documents")
            .select("id")
            .eq("deal_id", input.deal_id as string)
            .eq("doc_type", input.doc_type as string)
          const ids = (docs ?? []).map((d: { id: string }) => d.id)
          q = q.in("document_id", ids)
        }
        const { data, error } = await q
        if (error) return JSON.stringify({ error: error.message })
        return JSON.stringify(data)
      }

      case "send_whatsapp_message": {
        await sendWhatsAppMessage(textMessage(input.to as string, input.body as string))
        return JSON.stringify({ success: true })
      }

      case "get_photo_progress": {
        const { data, error } = await supabase
          .from("vehicle_photos")
          .select("photo_type, status")
          .eq("deal_id", input.deal_id as string)
        if (error) return JSON.stringify({ error: error.message })
        const required = [
          "front",
          "rear",
          "driver_side",
          "passenger_side",
          "interior_front",
          "interior_rear",
          "engine_bay",
          "odometer",
          "vin_plate",
        ]
        const uploaded = (data ?? []).map((p: { photo_type: string }) => p.photo_type)
        const missing = required.filter((t) => !uploaded.includes(t))
        return JSON.stringify({ uploaded, missing, total: required.length, received: uploaded.length })
      }

      case "create_task": {
        const { data, error } = await supabase
          .from("tasks")
          .insert({
            queue_name: input.queue_name,
            deal_id: input.deal_id,
            title: input.title,
            description: input.description ?? null,
            priority: input.priority ?? "NORMAL",
            status: "OPEN",
          })
          .select("id")
          .single()
        if (error) return JSON.stringify({ error: error.message })
        return JSON.stringify({ task_id: data.id })
      }

      case "log_audit": {
        const { error } = await supabase.from("audit_logs").insert({
          deal_id: input.deal_id,
          event_type: input.event_type,
          actor: input.actor,
          metadata: input.metadata ?? {},
        })
        if (error) return JSON.stringify({ error: error.message })
        return JSON.stringify({ success: true })
      }

      default:
        return JSON.stringify({ error: `Unknown tool: ${toolName}` })
    }
  } catch (err) {
    return JSON.stringify({ error: String(err) })
  }
}

// ---------------------------------------------------------------------------
// Conversation memory
// ---------------------------------------------------------------------------

async function loadConversationHistory(
  supabase: ReturnType<typeof getSupabaseClient>,
  phone: string,
  limit = 20
): Promise<Message[]> {
  const { data } = await supabase
    .from("conversation_messages")
    .select("role, content, tool_use, tool_result")
    .eq("phone", phone)
    .order("created_at", { ascending: false })
    .limit(limit)

  if (!data || data.length === 0) return []

  // Reverse to get chronological order
  return data.reverse().map((row: {
    role: string
    content: string | null
    tool_use: ContentBlock | null
    tool_result: ContentBlock | null
  }) => {
    if (row.tool_use) {
      return { role: row.role as "user" | "assistant", content: [row.tool_use] }
    }
    if (row.tool_result) {
      return { role: row.role as "user" | "assistant", content: [row.tool_result] }
    }
    return { role: row.role as "user" | "assistant", content: row.content ?? "" }
  })
}

async function saveMessage(
  supabase: ReturnType<typeof getSupabaseClient>,
  phone: string,
  dealId: string | null,
  partyType: string | null,
  role: "user" | "assistant",
  content: string | ContentBlock | null
): Promise<void> {
  const record: Record<string, unknown> = { phone, deal_id: dealId, party_type: partyType, role }

  if (typeof content === "string") {
    record.content = content
  } else if (content && content.type === "tool_use") {
    record.tool_use = content
  } else if (content && content.type === "tool_result") {
    record.tool_result = content
  } else if (content) {
    record.content = JSON.stringify(content)
  }

  await supabase.from("conversation_messages").insert(record)
}

// ---------------------------------------------------------------------------
// Media handling
// ---------------------------------------------------------------------------

async function handleMediaMessage(
  supabase: ReturnType<typeof getSupabaseClient>,
  msg: D360IncomingMessage,
  dealId: string | null,
  partyType: string | null
): Promise<string> {
  const mediaInfo = msg.image ?? msg.document
  if (!mediaInfo) return "Received unsupported media"

  const bytes = await downloadMedia(mediaInfo.id)

  const ext = mediaInfo.mime_type.split("/")[1] ?? "bin"
  const filename = "filename" in mediaInfo ? mediaInfo.filename : `${mediaInfo.id}.${ext}`
  const storagePath = `documents/${dealId ?? "unknown"}/${Date.now()}_${filename}`

  const { error: uploadError } = await supabase.storage
    .from("deal-documents")
    .upload(storagePath, bytes, { contentType: mediaInfo.mime_type, upsert: false })

  if (uploadError) {
    console.error("Storage upload error:", uploadError)
    return `Failed to store document: ${uploadError.message}`
  }

  // Create document record if we have a deal
  if (dealId) {
    const { data: doc } = await supabase
      .from("documents")
      .insert({
        deal_id: dealId,
        doc_type: "OTHER",
        storage_path: storagePath,
        original_filename: filename,
        uploaded_by: partyType ?? "buyer",
        status: "UPLOADED",
      })
      .select("id")
      .single()

    if (doc) {
      // Trigger async document processing
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!
      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      fetch(`${supabaseUrl}/functions/v1/process-document`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({
          document_id: doc.id,
          deal_id: dealId,
          file_url: storagePath,
          doc_type: "OTHER",
        }),
      }).catch(console.error)
    }
  }

  return `Document received and stored at: ${storagePath}`
}

// ---------------------------------------------------------------------------
// Core processing
// ---------------------------------------------------------------------------

async function processMessage(
  supabase: ReturnType<typeof getSupabaseClient>,
  msg: D360IncomingMessage,
  senderName: string
): Promise<void> {
  const phone = msg.from

  // Identify party
  const [buyerResult, sellerResult] = await Promise.all([
    supabase.from("buyers").select("id, deal_id").eq("phone", phone).maybeSingle(),
    supabase.from("sellers").select("id, deal_id").eq("phone", phone).maybeSingle(),
  ])

  const buyer = buyerResult.data
  const seller = sellerResult.data
  const isKnown = !!(buyer || seller)
  const dealId: string | null = buyer?.deal_id ?? seller?.deal_id ?? null
  const partyType = buyer ? "buyer" : seller ? "seller" : null

  if (!isKnown) {
    // Unknown phone — send welcome and exit
    await sendWhatsAppMessage(
      textMessage(
        phone,
        `Welcome to VehicleFinance! 🚗\n\nI'm your AI assistant for vehicle finance deals.\n\nIf you're a *buyer*, reply with your ID number to get started.\nIf you're a *seller*, reply *SELL* to list your vehicle.\n\nFor assistance, reply *HELP* at any time.`
      )
    )
    return
  }

  // Handle media messages separately
  let userText: string
  if (msg.type === "image" || msg.type === "document") {
    const storageResult = await handleMediaMessage(supabase, msg, dealId, partyType)
    userText = `[${msg.type.toUpperCase()} received: ${storageResult}]`
  } else {
    userText = msg.text?.body ?? `[${msg.type} message]`
  }

  // Save incoming message
  await saveMessage(supabase, phone, dealId, partyType, "user", userText)

  // Load conversation history
  const history = await loadConversationHistory(supabase, phone, 20)

  // Build messages array for Anthropic
  const messages: Message[] = [
    ...history,
    { role: "user", content: userText },
  ]

  // Agentic loop — keep calling until end_turn or no more tool_use
  let continueLoop = true
  while (continueLoop) {
    const response = await createMessage({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages,
      tools: BOT_TOOLS,
      tool_choice: { type: "auto" },
    })

    // Process each content block
    for (const block of response.content) {
      if (block.type === "text" && block.text) {
        // Send reply to WhatsApp
        await sendWhatsAppMessage(textMessage(phone, block.text))
        await saveMessage(supabase, phone, dealId, partyType, "assistant", block.text)
      } else if (block.type === "tool_use") {
        await saveMessage(supabase, phone, dealId, partyType, "assistant", block)
        // Execute tool
        const result = await executeTool(supabase, block.name, block.input)
        const toolResult: ContentBlockToolResult = {
          type: "tool_result",
          tool_use_id: block.id,
          content: result,
        }
        await saveMessage(supabase, phone, dealId, partyType, "user", toolResult)
        // Add to messages for next loop iteration
        messages.push({ role: "assistant", content: response.content })
        messages.push({ role: "user", content: [toolResult] })
      }
    }

    continueLoop = response.stop_reason === "tool_use"
  }
}

// ---------------------------------------------------------------------------
// HTTP handler
// ---------------------------------------------------------------------------

serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 })
  }

  let payload: D360WebhookPayload
  try {
    payload = await req.json()
  } catch {
    return new Response("Bad Request", { status: 400 })
  }

  // Acknowledge immediately
  const response = new Response(JSON.stringify({ status: "ok" }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  })

  // Process async
  const work = async () => {
    const supabase = getSupabaseClient()

    // Handle message status updates
    if (payload.statuses) {
      for (const status of payload.statuses) {
        await supabase
          .from("notifications")
          .update({ delivery_status: status.status, updated_at: new Date().toISOString() })
          .eq("external_message_id", status.id)
          .catch(console.error)
      }
    }

    // Handle incoming messages
    if (payload.messages) {
      const contacts = payload.contacts ?? []
      for (const msg of payload.messages) {
        const contact = contacts.find((c) => c.wa_id === msg.from)
        const senderName = contact?.profile?.name ?? msg.from
        try {
          await processMessage(supabase, msg, senderName)
        } catch (err) {
          console.error(`Error processing message from ${msg.from}:`, err)
        }
      }
    }
  }

  // @ts-ignore — Deno EdgeRuntime global
  if (typeof EdgeRuntime !== "undefined") {
    // @ts-ignore
    EdgeRuntime.waitUntil(work())
  } else {
    work().catch(console.error)
  }

  return response
})
