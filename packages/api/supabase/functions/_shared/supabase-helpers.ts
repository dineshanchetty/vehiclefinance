// Deno port of packages/bot/src/services/supabase.ts. Reuses the
// service-role client from supabase.ts (getSupabaseClient).
//
// Only the helpers the tool handlers + agent need are ported here.
//
// Buffer → Uint8Array, process.env → Deno.env.get.

import { getSupabaseClient } from "./supabase.ts"

// ── Deal helpers ─────────────────────────────────────────────────────────────

async function getDealByPartyPhone(table: "buyers" | "sellers", phone: string) {
  const sb = getSupabaseClient()
  const variants = phone.startsWith("+") ? [phone, phone.slice(1)] : [phone, `+${phone}`]
  const { data: partyRows, error: partyErr } = await sb
    .from(table)
    .select("deal_id")
    .in("phone", variants)
    .order("created_at", { ascending: false })
    .limit(1)
  if (partyErr) throw partyErr
  const dealId = partyRows?.[0]?.deal_id
  if (!dealId) return null
  const { data: deal, error: dealErr } = await sb
    .from("deals")
    .select("*, buyers(*), sellers(*), vehicles(*)")
    .eq("id", dealId)
    .single()
  if (dealErr && dealErr.code !== "PGRST116") throw dealErr
  return deal
}

export const getDealByBuyerPhone  = (phone: string) => getDealByPartyPhone("buyers", phone)
export const getDealBySellerPhone = (phone: string) => getDealByPartyPhone("sellers", phone)

export async function getDealById(dealId: string) {
  const sb = getSupabaseClient()
  const { data, error } = await sb
    .from("deals")
    .select("*, buyers(*), sellers(*), vehicles(*)")
    .eq("id", dealId)
    .single()
  if (error) throw error
  return data
}

export async function updateDealStatus(dealId: string, status: string) {
  const sb = getSupabaseClient()
  const { data, error } = await sb
    .from("deals")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", dealId).select().single()
  if (error) throw error
  return data
}

// ── Documents ─────────────────────────────────────────────────────────────────

export async function storeDocument(record: {
  deal_id: string
  party_type: "buyer" | "seller"
  document_type: string
  storage_path: string
  original_filename?: string
  mime_type?: string
}) {
  const sb = getSupabaseClient()
  const row = {
    deal_id: record.deal_id,
    party: record.party_type.toUpperCase(),
    doc_type: record.document_type,
    storage_path: record.storage_path,
    file_url: record.storage_path,
    file_name: record.original_filename ?? null,
    mime_type: record.mime_type ?? null,
    status: "uploaded",
    upload_timestamp: new Date().toISOString(),
  }
  const { data, error } = await sb.from("documents").insert(row).select().single()
  if (error) throw error
  return data
}

export async function updateDocumentExtraction(
  documentId: string, extractedData: Record<string, unknown>, confidence: Record<string, number>,
) {
  const sb = getSupabaseClient()
  const { data, error } = await sb
    .from("documents")
    .update({
      extracted_data: extractedData,
      confidence_scores: confidence,
      status: "extracted",
      extracted_at: new Date().toISOString(),
    })
    .eq("id", documentId).select().single()
  if (error) throw error
  return data
}

// ── Vehicle photos ───────────────────────────────────────────────────────────

const ANGLE_TO_ENUM: Record<string, string> = {
  front: "FRONT_VIEW", rear: "REAR_VIEW",
  driver_side: "RIGHT_SIDE", passenger_side: "LEFT_SIDE",
  interior_front: "INTERIOR_DASHBOARD", interior_rear: "BOOT_INTERIOR",
  engine_bay: "ENGINE_BAY", boot: "BOOT_INTERIOR",
  odometer: "ODOMETER", other: "DAMAGE_CLOSEUP",
}

/**
 * Get-or-create the photo_set for a deal. Race-tolerant: when a seller fires
 * a batch through WhatsApp, multiple webhooks land in parallel and all call
 * this concurrently. Without the fallback `select` after a duplicate insert,
 * one of them races, the unique constraint trips, the insert errors, and the
 * batch's first photo gets reported as failed even though the photo_set is
 * being created right next door.
 */
async function getOrCreatePhotoSet(dealId: string): Promise<{ id: string } | null> {
  const sb = getSupabaseClient()
  // 1. Already exists?
  const { data: existing } = await sb
    .from("vehicle_photo_sets").select("id")
    .eq("deal_id", dealId).order("created_at", { ascending: false }).limit(1).maybeSingle()
  if (existing?.id) return existing

  // 2. Need a vehicle row to FK the photo_set against.
  const { data: vehicleRow } = await sb
    .from("vehicles").select("id").eq("deal_id", dealId).limit(1).maybeSingle()
  const vehicleId = vehicleRow?.id
  if (!vehicleId) return null

  // 3. Try the insert. If a parallel webhook beat us to it, the insert hits
  // a unique constraint — re-read and return that row instead of erroring.
  const { data: created, error } = await sb.from("vehicle_photo_sets").insert({
    deal_id: dealId, vehicle_id: vehicleId, status: "IN_PROGRESS", mandatory_required: 9,
  }).select("id").maybeSingle()
  if (created?.id) return created
  if (error) {
    const { data: raceWinner } = await sb
      .from("vehicle_photo_sets").select("id")
      .eq("deal_id", dealId).order("created_at", { ascending: false }).limit(1).maybeSingle()
    if (raceWinner?.id) return raceWinner
    throw error
  }
  return null
}

/**
 * Store a vehicle photo, replacing any existing photo for the SAME angle on
 * the SAME photo_set. We keep at most ONE photo per angle so the set never
 * inflates with duplicates when the seller fires a batch through WhatsApp
 * (a scenario where the same physical photo can arrive multiple times via
 * separate webhooks, or the classifier puts multiple shots into the same
 * bucket).
 *
 * Returns the new row plus a `replaced` flag so the agent can communicate
 * sensibly ("✅ Updated your front shot" vs "✅ Got the front (1/9)").
 */
export async function storeVehiclePhoto(record: {
  deal_id: string; angle: string; storage_path: string; original_filename?: string
}): Promise<{ id: string; angle_type: string; file_url: string; file_name: string | null; upload_timestamp: string; replaced?: boolean; replaced_id?: string }> {
  const sb = getSupabaseClient()
  const photoSet = await getOrCreatePhotoSet(record.deal_id)
  if (!photoSet) {
    throw new Error("Cannot store vehicle photo — no vehicle on deal to create a photo_set.")
  }
  const angleType = ANGLE_TO_ENUM[record.angle] ?? "DAMAGE_CLOSEUP"

  // Look for an existing photo for this angle. If found, delete it first
  // (DB row + storage object) so we keep a clean 1-per-angle set.
  const { data: existing } = await sb.from("vehicle_photos")
    .select("id, file_url")
    .eq("photo_set_id", photoSet.id)
    .eq("angle_type", angleType)
    .maybeSingle()

  let replacedId: string | undefined
  if (existing?.id) {
    replacedId = existing.id
    // Best-effort storage cleanup. The file_url is the public URL, strip the
    // bucket prefix to get the object path. Failure here is non-fatal —
    // orphaned objects can be swept later.
    const url = existing.file_url ?? ""
    const prefix = `${Deno.env.get("SUPABASE_URL")}/storage/v1/object/public/documents/`
    if (url.startsWith(prefix)) {
      const objectPath = url.slice(prefix.length)
      await sb.storage.from("documents").remove([objectPath]).catch((e) => {
        console.warn("[storeVehiclePhoto] storage cleanup failed:", e)
      })
    }
    await sb.from("vehicle_photos").delete().eq("id", existing.id)
  }

  const { data, error } = await sb.from("vehicle_photos").insert({
    photo_set_id: photoSet.id,
    angle_type: angleType,
    file_url: record.storage_path,
    file_name: record.original_filename ?? null,
    upload_timestamp: new Date().toISOString(),
  }).select().single()
  if (error) throw error
  return { ...data, replaced: !!replacedId, replaced_id: replacedId }
}

export async function getVehiclePhotos(dealId: string) {
  const sb = getSupabaseClient()
  const { data: sets } = await sb.from("vehicle_photo_sets").select("id").eq("deal_id", dealId)
  const setIds = (sets ?? []).map((s: { id: string }) => s.id)
  if (setIds.length === 0) return []
  const { data, error } = await sb.from("vehicle_photos")
    .select("id, angle_type, file_url, photo_set_id").in("photo_set_id", setIds)
  if (error) throw error
  const ENUM_TO_ANGLE: Record<string, string> = {}
  for (const [k, v] of Object.entries(ANGLE_TO_ENUM)) ENUM_TO_ANGLE[v] = k
  return (data ?? []).map((p: { id: string; angle_type: string | null; file_url: string | null }) => ({
    id: p.id,
    angle: ENUM_TO_ANGLE[p.angle_type ?? ""] ?? "other",
    storage_path: p.file_url ?? "",
  }))
}

// ── Audit log / ops tasks / extraction tasks ─────────────────────────────────

export async function logAuditEvent(record: {
  deal_id?: string; phone?: string; event_type: string; description: string;
  metadata?: Record<string, unknown>
}) {
  const sb = getSupabaseClient()
  const { error } = await sb.from("audit_logs").insert({
    ...record, created_at: new Date().toISOString(),
  })
  if (error) throw error
}

/**
 * Create an ops task for human review. Writes to the `tasks` table (NOT
 * `ops_tasks`) — that's the table the web dashboard's Queues sidebar +
 * Deal → Tasks tab read from. Maps the bot's lower-case priority to the
 * task_priority enum (LOW / NORMAL / HIGH / URGENT) and routes onto a
 * sensible queue based on task_type so it lands somewhere ops will see.
 */
export async function createOpsTask(record: {
  deal_id?: string; task_type: string; description: string;
  priority?: "low" | "normal" | "high" | "urgent"; assigned_to?: string;
  metadata?: Record<string, unknown>
}) {
  const sb = getSupabaseClient()
  const priority = (record.priority ?? "normal").toUpperCase() as "LOW" | "NORMAL" | "HIGH" | "URGENT"
  // Best-guess queue routing — falls back to escalations.
  const t = (record.task_type ?? "").toLowerCase()
  let queue = "Q_HUMAN_ESCALATION"
  if (t.includes("doc") || t.includes("review_id") || t.includes("review_poa") || t.includes("statement")) queue = "Q_BUYER_DOC_REVIEW"
  else if (t.includes("photo")) queue = "Q_SELLER_PHOTO_REVIEW"
  else if (t.includes("fni") || t.includes("affordab")) queue = "Q_FNI_REVIEW"
  else if (t.includes("quote")) queue = "Q_FNI_QUOTE_PREP"
  else if (t.includes("contract")) queue = "Q_SELLER_CONTRACT"
  else if (t.includes("inspect")) queue = "Q_HARTCON_INSPECTION"
  else if (t.includes("natis")) queue = "Q_NATIS_FULFILMENT"
  else if (t.includes("seller")) queue = "Q_SELLER_FOLLOWUP"

  const { data, error } = await sb.from("tasks").insert({
    deal_id: record.deal_id,
    task_type: record.task_type,
    queue,
    priority,
    status: "PENDING",
    notes: record.description,    // bot's free-text "description" → tasks.notes
    assigned_to: record.assigned_to ?? null,
    created_at: new Date().toISOString(),
  }).select().single()
  if (error) throw error
  return data
}

export async function createExtractionTask(documentId: string) {
  const sb = getSupabaseClient()
  const { data, error } = await sb.from("extraction_tasks").insert({
    document_id: documentId, status: "pending", created_at: new Date().toISOString(),
  }).select().single()
  if (error) throw error
  return data
}

export async function getExtractionResult(documentId: string) {
  const sb = getSupabaseClient()
  const { data: doc, error: docErr } = await sb.from("documents")
    .select("id, status, doc_type, extracted_at, error_message")
    .eq("id", documentId).maybeSingle()
  if (docErr) throw docErr
  if (!doc) return null
  const { data: rows, error: resErr } = await sb.from("extraction_results")
    .select("field_name, extracted_value, confidence, verification_status, created_at")
    .eq("document_id", documentId).order("created_at", { ascending: false })
  if (resErr) throw resErr
  const seen = new Set<string>()
  const latest: Record<string, { value: unknown; confidence: number | null }> = {}
  let cs = 0, cc = 0
  for (const r of rows ?? []) {
    if (seen.has(r.field_name)) continue
    seen.add(r.field_name)
    latest[r.field_name] = { value: r.extracted_value, confidence: r.confidence }
    if (typeof r.confidence === "number") { cs += r.confidence; cc += 1 }
  }
  return {
    document_id: documentId, status: doc.status, doc_type: doc.doc_type,
    extracted_at: doc.extracted_at, error_message: doc.error_message,
    fields: latest, field_count: Object.keys(latest).length,
    average_confidence: cc > 0 ? cs / cc : null,
  }
}

// ── Quote / contract / seller details ────────────────────────────────────────

export async function storeSellerDetails(
  dealId: string,
  details: {
    name: string; phone: string;
    vehicle_make?: string; vehicle_model?: string;
    vehicle_year?: number; vehicle_price?: number
  },
) {
  const sb = getSupabaseClient()
  const { data, error } = await sb.from("deals").update({
    seller_name: details.name, seller_phone: details.phone,
    vehicle_make: details.vehicle_make, vehicle_model: details.vehicle_model,
    vehicle_year: details.vehicle_year, vehicle_price: details.vehicle_price,
    updated_at: new Date().toISOString(),
  }).eq("id", dealId).select().single()
  if (error) throw error
  return data
}

export async function getLatestQuote(dealId: string) {
  const sb = getSupabaseClient()
  const { data, error } = await sb.from("quotes").select("*")
    .eq("deal_id", dealId).order("created_at", { ascending: false })
    .limit(1).single()
  if (error && error.code !== "PGRST116") throw error
  return data
}

export async function recordQuoteResponse(quoteId: string, response: "accepted" | "declined") {
  const sb = getSupabaseClient()
  const { data, error } = await sb.from("quotes").update({
    buyer_response: response, responded_at: new Date().toISOString(),
  }).eq("id", quoteId).select().single()
  if (error) throw error
  return data
}

export async function getContract(dealId: string) {
  const sb = getSupabaseClient()
  const { data, error } = await sb.from("contracts").select("*")
    .eq("deal_id", dealId).order("created_at", { ascending: false }).limit(1).single()
  if (error && error.code !== "PGRST116") throw error
  return data
}

// ── Storage upload (Uint8Array, not Buffer) ──────────────────────────────────

export async function uploadFileToStorage(
  bucket: string, path: string, bytes: Uint8Array, contentType: string,
): Promise<string> {
  const sb = getSupabaseClient()
  const { error } = await sb.storage.from(bucket).upload(path, bytes, {
    contentType, upsert: true,
  })
  if (error) throw error
  const { data } = sb.storage.from(bucket).getPublicUrl(path)
  return data.publicUrl
}
