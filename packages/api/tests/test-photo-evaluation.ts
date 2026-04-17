/**
 * test-photo-evaluation.ts — Vehicle photo workflow and evaluation tests
 *
 * Run:  deno test --allow-env --allow-net packages/api/tests/test-photo-evaluation.ts
 *
 * Env:  SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { assertEquals, assertExists } from "jsr:@std/assert";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "https://sahvfsoclzgsuewbiiah.supabase.co";
const SUPABASE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Helper: create a deal + vehicle + photo_set scaffold
async function scaffoldPhotoSet() {
  const { data: deal } = await supabase
    .from("deals")
    .insert({ notes: "integration_test" })
    .select("id")
    .single();

  const { data: vehicle } = await supabase
    .from("vehicles")
    .insert({ deal_id: deal!.id, make: "Ford", model: "Ranger", year: 2021 })
    .select("id")
    .single();

  const { data: photoSet } = await supabase
    .from("vehicle_photo_sets")
    .insert({ deal_id: deal!.id, vehicle_id: vehicle!.id })
    .select("id,mandatory_received,mandatory_required,coverage_score")
    .single();

  return { dealId: deal!.id, vehicleId: vehicle!.id, photoSetId: photoSet!.id };
}

// ─── Test: Photo set mandatory_received increments ────────────────────────────

Deno.test("photo-set: mandatory_received increments as mandatory photos are added", async () => {
  const { dealId, photoSetId } = await scaffoldPhotoSet();

  // Photo set starts at 0
  const { data: initial } = await supabase
    .from("vehicle_photo_sets")
    .select("mandatory_received,coverage_score")
    .eq("id", photoSetId)
    .single();
  assertEquals(initial!.mandatory_received, 0, "Should start with 0 mandatory received");

  const mandatoryAngles = [
    "FRONT_VIEW", "REAR_VIEW", "LEFT_SIDE", "RIGHT_SIDE",
    "FRONT_LEFT_ANGLE", "FRONT_RIGHT_ANGLE",
    "ODOMETER", "INTERIOR_DASHBOARD", "ENGINE_BAY",
  ];

  // Add photos one by one and verify count increments
  for (let i = 0; i < mandatoryAngles.length; i++) {
    await supabase.from("vehicle_photos").insert({
      photo_set_id: photoSetId,
      angle_type: mandatoryAngles[i],
      file_url: `https://storage.example.com/${photoSetId}/${mandatoryAngles[i]}.jpg`,
      quality_score: 85,
    });

    const { data: ps } = await supabase
      .from("vehicle_photo_sets")
      .select("mandatory_received,coverage_score")
      .eq("id", photoSetId)
      .single();

    assertEquals(
      ps!.mandatory_received,
      i + 1,
      `After adding photo ${i + 1} (${mandatoryAngles[i]}), mandatory_received should be ${i + 1}`,
    );
  }

  // Verify coverage_score after all 9 mandatory angles
  const { data: final } = await supabase
    .from("vehicle_photo_sets")
    .select("mandatory_received,mandatory_required,coverage_score")
    .eq("id", photoSetId)
    .single();

  assertEquals(final!.mandatory_received, 9, "All 9 mandatory photos counted");
  assertEquals(final!.mandatory_required, 9);
  assertEquals(
    Number(final!.coverage_score),
    100,
    "Coverage score must be 100% when all mandatory photos uploaded",
  );

  // Optional photo should NOT increment mandatory_received
  await supabase.from("vehicle_photos").insert({
    photo_set_id: photoSetId,
    angle_type: "DAMAGE_CLOSEUP",
    file_url: `https://storage.example.com/${photoSetId}/damage.jpg`,
    quality_score: 90,
  });

  const { data: afterOptional } = await supabase
    .from("vehicle_photo_sets")
    .select("mandatory_received")
    .eq("id", photoSetId)
    .single();
  assertEquals(afterOptional!.mandatory_received, 9, "Optional photo must not increment mandatory count");

  // Cleanup
  await supabase.from("deals").delete().eq("id", dealId);
});

// ─── Test: Photo quality → quality_status trigger ─────────────────────────────

Deno.test("photo: quality_score 85 → quality_status = ACCEPTED", async () => {
  const { dealId, photoSetId } = await scaffoldPhotoSet();

  const { data: photo, error } = await supabase
    .from("vehicle_photos")
    .insert({
      photo_set_id: photoSetId,
      angle_type: "FRONT_VIEW",
      file_url: "https://storage.example.com/test/front.jpg",
      quality_score: 85,
    })
    .select("quality_score,quality_status")
    .single();

  assertEquals(error, null, `Insert photo: ${error?.message}`);
  assertEquals(photo!.quality_status, "ACCEPTED", "Score 85 (≥80) → ACCEPTED");

  await supabase.from("deals").delete().eq("id", dealId);
});

Deno.test("photo: quality_score 65 → quality_status = ACCEPTED_WITH_WARNING", async () => {
  const { dealId, photoSetId } = await scaffoldPhotoSet();

  const { data: photo, error } = await supabase
    .from("vehicle_photos")
    .insert({
      photo_set_id: photoSetId,
      angle_type: "REAR_VIEW",
      file_url: "https://storage.example.com/test/rear.jpg",
      quality_score: 65,
    })
    .select("quality_score,quality_status")
    .single();

  assertEquals(error, null, `Insert photo: ${error?.message}`);
  assertEquals(photo!.quality_status, "ACCEPTED_WITH_WARNING", "Score 65 (≥60,<80) → ACCEPTED_WITH_WARNING");

  await supabase.from("deals").delete().eq("id", dealId);
});

Deno.test("photo: quality_score 42 → quality_status = REJECTED", async () => {
  const { dealId, photoSetId } = await scaffoldPhotoSet();

  const { data: photo, error } = await supabase
    .from("vehicle_photos")
    .insert({
      photo_set_id: photoSetId,
      angle_type: "LEFT_SIDE",
      file_url: "https://storage.example.com/test/left.jpg",
      quality_score: 42,
    })
    .select("quality_score,quality_status")
    .single();

  assertEquals(error, null, `Insert photo: ${error?.message}`);
  assertEquals(photo!.quality_status, "REJECTED", "Score 42 (<60) → REJECTED");

  // Rejected photo should NOT increment mandatory_received
  const { data: ps } = await supabase
    .from("vehicle_photo_sets")
    .select("mandatory_received")
    .eq("id", photoSetId)
    .single();
  assertEquals(ps!.mandatory_received, 0, "Rejected photo must not count toward mandatory_received");

  await supabase.from("deals").delete().eq("id", dealId);
});

Deno.test("photo: quality_score update changes quality_status", async () => {
  const { dealId, photoSetId } = await scaffoldPhotoSet();

  const { data: photo } = await supabase
    .from("vehicle_photos")
    .insert({
      photo_set_id: photoSetId,
      angle_type: "RIGHT_SIDE",
      file_url: "https://storage.example.com/test/right.jpg",
      quality_score: 42,
    })
    .select("id,quality_status")
    .single();

  assertEquals(photo!.quality_status, "REJECTED");

  // Update quality_score — trigger should re-evaluate
  const { data: updated, error } = await supabase
    .from("vehicle_photos")
    .update({ quality_score: 82 })
    .eq("id", photo!.id)
    .select("quality_status")
    .single();

  assertEquals(error, null);
  assertEquals(updated!.quality_status, "ACCEPTED", "Updated score 82 → ACCEPTED");

  await supabase.from("deals").delete().eq("id", dealId);
});

// ─── Test: Quick evaluation requires_manual_review trigger ────────────────────

Deno.test("evaluation: confidence 0.55 → requires_manual_review = true", async () => {
  const { dealId, vehicleId, photoSetId } = await scaffoldPhotoSet();

  const { data: eval_, error } = await supabase
    .from("vehicle_quick_evaluations")
    .insert({
      deal_id: dealId,
      vehicle_id: vehicleId,
      photo_set_id: photoSetId,
      condition_band: "FAIR",
      overall_confidence: 0.55,
      damage_items: [],
      recommendation: "Low confidence — manual review required",
    })
    .select("overall_confidence,requires_manual_review")
    .single();

  assertEquals(error, null, `Insert evaluation: ${error?.message}`);
  assertEquals(eval_!.requires_manual_review, true, "Confidence 0.55 (<0.60) → requires_manual_review = true");

  await supabase.from("deals").delete().eq("id", dealId);
});

Deno.test("evaluation: SEVERE damage → requires_manual_review = true", async () => {
  const { dealId, vehicleId, photoSetId } = await scaffoldPhotoSet();

  const { data: eval_, error } = await supabase
    .from("vehicle_quick_evaluations")
    .insert({
      deal_id: dealId,
      vehicle_id: vehicleId,
      photo_set_id: photoSetId,
      condition_band: "POOR",
      overall_confidence: 0.82,
      damage_items: [
        { description: "Severe front-end collision damage", severity: "SEVERE", location: "Front bumper" },
        { description: "Minor scratch", severity: "MINOR", location: "Door panel" },
      ],
      recommendation: "Severe damage detected — requires manual inspection",
    })
    .select("overall_confidence,requires_manual_review,damage_items")
    .single();

  assertEquals(error, null, `Insert evaluation: ${error?.message}`);
  assertEquals(
    eval_!.requires_manual_review,
    true,
    "SEVERE damage item → requires_manual_review = true even if confidence is high",
  );

  await supabase.from("deals").delete().eq("id", dealId);
});

Deno.test("evaluation: confidence 0.85 + no SEVERE damage → requires_manual_review = false", async () => {
  const { dealId, vehicleId, photoSetId } = await scaffoldPhotoSet();

  const { data: eval_, error } = await supabase
    .from("vehicle_quick_evaluations")
    .insert({
      deal_id: dealId,
      vehicle_id: vehicleId,
      photo_set_id: photoSetId,
      condition_band: "GOOD",
      overall_confidence: 0.85,
      damage_items: [
        { description: "Light stone chips on bonnet", severity: "MINOR", location: "Bonnet" },
        { description: "Small dent on door", severity: "MODERATE", location: "Driver door" },
      ],
      recommendation: "Vehicle in good condition, proceed to inspection",
    })
    .select("requires_manual_review")
    .single();

  assertEquals(error, null, `Insert evaluation: ${error?.message}`);
  assertEquals(
    eval_!.requires_manual_review,
    false,
    "Confidence 0.85 + no SEVERE damage → requires_manual_review = false",
  );

  await supabase.from("deals").delete().eq("id", dealId);
});

// ─── Test: Evaluation output structure ────────────────────────────────────────

Deno.test("evaluation: complete record has all required fields", async () => {
  const { dealId, vehicleId, photoSetId } = await scaffoldPhotoSet();

  const { data: eval_, error } = await supabase
    .from("vehicle_quick_evaluations")
    .insert({
      deal_id: dealId,
      vehicle_id: vehicleId,
      photo_set_id: photoSetId,
      condition_band: "EXCELLENT",
      overall_confidence: 0.94,
      damage_items: [],
      recommendation: "Excellent condition vehicle — proceed without concerns",
      exterior_summary: "Clean paintwork, no visible damage",
      interior_summary: "Well-maintained interior",
    })
    .select("*")
    .single();

  assertEquals(error, null, `Insert evaluation: ${error?.message}`);
  assertExists(eval_!.id, "id must exist");
  assertExists(eval_!.condition_band, "condition_band must exist");
  assertExists(eval_!.overall_confidence, "overall_confidence must exist");
  assertExists(eval_!.damage_items, "damage_items must exist");
  assertExists(eval_!.disclaimer, "disclaimer must exist (has DB default)");
  assertExists(eval_!.recommendation, "recommendation must exist");
  assertEquals(eval_!.condition_band, "EXCELLENT");
  assertEquals(Number(eval_!.overall_confidence), 0.94);
  assertEquals(eval_!.requires_manual_review, false);

  await supabase.from("deals").delete().eq("id", dealId);
});
