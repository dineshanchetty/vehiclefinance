import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { getSupabaseClient } from "../_shared/supabase.ts"
import { createMessage, type ContentBlockImage, type Message } from "../_shared/anthropic.ts"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface EvaluatePhotosRequest {
  photo_set_id: string
  deal_id: string
  vehicle_id: string
}

interface DamageItem {
  location: string
  type: string
  severity: "MINOR" | "MODERATE" | "MAJOR" | "SEVERE"
  confidence: number
  description: string
}

interface PhotoEvaluation {
  overall_condition: "EXCELLENT" | "GOOD" | "FAIR" | "POOR" | "SEVERE"
  condition_confidence: number
  odometer_reading: string | null
  odometer_confidence: number
  cross_image_consistency: "PASS" | "FAIL" | "PARTIAL"
  consistency_notes: string
  damage_items: DamageItem[]
  summary: string
  disclaimer: string
}

interface VehiclePhoto {
  id: string
  photo_type: string
  storage_path: string
  mime_type: string
}

// ---------------------------------------------------------------------------
// Evaluation prompt
// ---------------------------------------------------------------------------

const EVALUATION_PROMPT = `You are an expert vehicle condition assessor. Analyze these vehicle photos and provide a structured evaluation.

For each image, assess:
1. Visible damage: dents, scratches, paint issues (chips, fading, bubbling), cracked lights, windscreen damage, body panel misalignment
2. Overall cleanliness and maintenance level
3. For the odometer photo: extract the exact reading shown
4. For the VIN plate photo: note if clearly visible
5. Cross-image consistency: verify all photos show the same vehicle (same colour, same registration where visible)

Rate overall condition as:
- EXCELLENT: Showroom condition, no visible defects
- GOOD: Minor wear only, no significant damage
- FAIR: Moderate wear, some minor damage present
- POOR: Notable damage in multiple areas
- SEVERE: Significant structural or extensive cosmetic damage

For each damage item, provide location, type, severity (MINOR/MODERATE/MAJOR/SEVERE), confidence (0.0-1.0), and description.

Return ONLY valid JSON matching this exact schema:
{
  "overall_condition": "EXCELLENT|GOOD|FAIR|POOR|SEVERE",
  "condition_confidence": 0.0,
  "odometer_reading": "number as string or null",
  "odometer_confidence": 0.0,
  "cross_image_consistency": "PASS|FAIL|PARTIAL",
  "consistency_notes": "string",
  "damage_items": [
    {
      "location": "e.g. front bumper left side",
      "type": "e.g. dent, scratch, paint chip",
      "severity": "MINOR|MODERATE|MAJOR|SEVERE",
      "confidence": 0.0,
      "description": "brief description"
    }
  ],
  "summary": "2-3 sentence plain English summary of the vehicle condition"
}`

const DISCLAIMER =
  "⚠️ PRELIMINARY AI ASSESSMENT — ADVISORY ONLY. This automated evaluation does not replace a professional Hartcon inspection. Results should be verified by a qualified assessor before any financial decision is made."

// ---------------------------------------------------------------------------
// Trigger conditions for human review
// ---------------------------------------------------------------------------

function needsHumanReview(evaluation: PhotoEvaluation): boolean {
  if (evaluation.condition_confidence < 0.6) return true
  if (evaluation.cross_image_consistency === "FAIL") return true
  if (evaluation.damage_items.some((d) => d.severity === "MAJOR" || d.severity === "SEVERE"))
    return true
  return false
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 })
  }

  let body: EvaluatePhotosRequest
  try {
    body = await req.json()
  } catch {
    return new Response("Bad Request: invalid JSON", { status: 400 })
  }

  const { photo_set_id, deal_id, vehicle_id } = body

  if (!photo_set_id || !deal_id || !vehicle_id) {
    return new Response("Bad Request: missing required fields", { status: 400 })
  }

  const supabase = getSupabaseClient()

  try {
    // Load all photos for this photo set
    const { data: photos, error: photosError } = await supabase
      .from("vehicle_photos")
      .select("id, photo_type, storage_path, mime_type")
      .eq("photo_set_id", photo_set_id)
      .eq("vehicle_id", vehicle_id)

    if (photosError) throw new Error(`Failed to load photos: ${photosError.message}`)
    if (!photos || photos.length === 0) throw new Error("No photos found for photo set")

    const REQUIRED_PHOTOS = [
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

    const receivedTypes = photos.map((p: VehiclePhoto) => p.photo_type)
    const missingTypes = REQUIRED_PHOTOS.filter((t) => !receivedTypes.includes(t))

    if (missingTypes.length > 0) {
      return new Response(
        JSON.stringify({ error: `Missing required photos: ${missingTypes.join(", ")}` }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      )
    }

    // Download all photos and convert to base64
    const imageBlocks: (ContentBlockImage & { photo_type: string })[] = []

    for (const photo of photos as VehiclePhoto[]) {
      const { data: fileData, error: dlError } = await supabase.storage
        .from("vehicle-photos")
        .download(photo.storage_path)

      if (dlError || !fileData) {
        console.warn(`Failed to download photo ${photo.id}: ${dlError?.message}`)
        continue
      }

      const arrayBuffer = await fileData.arrayBuffer()
      const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)))
      const mimeType = photo.mime_type || fileData.type || "image/jpeg"

      imageBlocks.push({
        photo_type: photo.photo_type,
        type: "image",
        source: { type: "base64", media_type: mimeType, data: base64 },
      })
    }

    if (imageBlocks.length < REQUIRED_PHOTOS.length) {
      throw new Error(`Only ${imageBlocks.length}/${REQUIRED_PHOTOS.length} photos could be loaded`)
    }

    // Build message content: all images + prompt
    // Add a text label before each image so the model knows what it's looking at
    const messageContent: Array<ContentBlockImage | { type: "text"; text: string }> = []

    for (const block of imageBlocks) {
      messageContent.push({ type: "text", text: `Photo type: ${block.photo_type}` })
      const { photo_type: _pt, ...imageBlock } = block
      messageContent.push(imageBlock as ContentBlockImage)
    }

    messageContent.push({ type: "text", text: EVALUATION_PROMPT })

    const messages: Message[] = [
      { role: "user", content: messageContent },
    ]

    // Call Anthropic vision API
    const aiResponse = await createMessage({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2048,
      messages,
    })

    const rawText = aiResponse.content.find((b) => b.type === "text")
    if (!rawText || rawText.type !== "text") {
      throw new Error("No text response from Anthropic")
    }

    const jsonStr = rawText.text.replace(/^```json\n?/, "").replace(/\n?```$/, "").trim()
    const evaluation: PhotoEvaluation = JSON.parse(jsonStr)

    // Add disclaimer
    evaluation.disclaimer = DISCLAIMER

    // Store evaluation result
    const { data: evalRecord, error: insertError } = await supabase
      .from("vehicle_quick_evaluations")
      .insert({
        photo_set_id,
        deal_id,
        vehicle_id,
        overall_condition: evaluation.overall_condition,
        condition_confidence: evaluation.condition_confidence,
        odometer_reading: evaluation.odometer_reading,
        odometer_confidence: evaluation.odometer_confidence,
        cross_image_consistency: evaluation.cross_image_consistency,
        consistency_notes: evaluation.consistency_notes,
        damage_items: evaluation.damage_items,
        summary: evaluation.summary,
        disclaimer: evaluation.disclaimer,
        model_used: "claude-sonnet-4-20250514",
        photos_analyzed: imageBlocks.length,
      })
      .select("id")
      .single()

    if (insertError) throw new Error(`Failed to store evaluation: ${insertError.message}`)

    // Create human review task if trigger conditions met
    if (needsHumanReview(evaluation)) {
      const triggerReasons: string[] = []
      if (evaluation.condition_confidence < 0.6) triggerReasons.push("low confidence")
      if (evaluation.cross_image_consistency === "FAIL") triggerReasons.push("consistency failure")
      const severeItems = evaluation.damage_items.filter(
        (d) => d.severity === "MAJOR" || d.severity === "SEVERE"
      )
      if (severeItems.length > 0) triggerReasons.push(`${severeItems.length} major/severe damage items`)

      await supabase.from("tasks").insert({
        queue_name: "Q_SELLER_PHOTO_REVIEW",
        deal_id,
        title: `Vehicle photo review required: ${evaluation.overall_condition}`,
        description: `Triggered by: ${triggerReasons.join(", ")}. Evaluation ID: ${evalRecord.id}`,
        priority: severeItems.length > 0 ? "HIGH" : "NORMAL",
        status: "OPEN",
        metadata: {
          photo_set_id,
          vehicle_id,
          evaluation_id: evalRecord.id,
          trigger_reasons: triggerReasons,
        },
      })
    }

    // Audit log
    await supabase.from("audit_logs").insert({
      deal_id,
      event_type: "VEHICLE_PHOTOS_EVALUATED",
      actor: "system:evaluate-vehicle-photos",
      metadata: {
        photo_set_id,
        vehicle_id,
        evaluation_id: evalRecord.id,
        overall_condition: evaluation.overall_condition,
        confidence: evaluation.condition_confidence,
        damage_count: evaluation.damage_items.length,
        human_review_triggered: needsHumanReview(evaluation),
      },
    })

    return new Response(
      JSON.stringify({
        success: true,
        evaluation_id: evalRecord.id,
        overall_condition: evaluation.overall_condition,
        condition_confidence: evaluation.condition_confidence,
        damage_items_count: evaluation.damage_items.length,
        human_review_required: needsHumanReview(evaluation),
        summary: evaluation.summary,
        disclaimer: evaluation.disclaimer,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    )
  } catch (err) {
    console.error("evaluate-vehicle-photos error:", err)
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    )
  }
})
