/**
 * run-tests.ts — Test runner: executes all integration tests and reports results
 *
 * Run:  deno run --allow-env --allow-net packages/api/tests/run-tests.ts
 *
 * Env:  SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * This runner imports and re-runs each test suite programmatically, collecting
 * pass/fail counts and printing a summary. For CI use, prefer:
 *
 *   deno test --allow-env --allow-net packages/api/tests/
 */

import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "https://sahvfsoclzgsuewbiiah.supabase.co";
const SUPABASE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

if (!SUPABASE_KEY) {
  console.error("ERROR: SUPABASE_SERVICE_ROLE_KEY env var is required");
  Deno.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ─── Result tracking ──────────────────────────────────────────────────────────

interface TestResult {
  suite: string;
  name: string;
  passed: boolean;
  error?: string;
  durationMs: number;
}

const results: TestResult[] = [];

async function run(suite: string, name: string, fn: () => Promise<void>) {
  const start = Date.now();
  try {
    await fn();
    results.push({ suite, name, passed: true, durationMs: Date.now() - start });
    console.log(`  ✓ ${name} (${Date.now() - start}ms)`);
  } catch (err) {
    results.push({
      suite,
      name,
      passed: false,
      error: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - start,
    });
    console.log(`  ✗ ${name} (${Date.now() - start}ms)`);
    console.log(`    → ${err instanceof Error ? err.message : err}`);
  }
}

// ─── Suite helpers ────────────────────────────────────────────────────────────

async function createTestDeal(): Promise<string> {
  const { data } = await supabase
    .from("deals")
    .insert({ notes: "integration_test" })
    .select("id")
    .single();
  if (!data) throw new Error("Failed to create test deal");
  return data.id;
}

// ─── Suite 1: Database Schema ─────────────────────────────────────────────────

async function runDatabaseSuite() {
  console.log("\n[Suite 1] Database Schema");

  const REQUIRED_TABLES = [
    "deals","buyers","sellers","vehicles","documents","extraction_results",
    "verification_checks","vehicle_photo_sets","vehicle_photos",
    "vehicle_quick_evaluations","quotes","inspections","contracts",
    "signature_events","tasks","audit_events","notifications",
    "natis_fulfilments","audit_logs","ops_tasks","extraction_tasks",
  ];

  await run("database", "all 21 required tables exist", async () => {
    for (const table of REQUIRED_TABLES) {
      const { error } = await (supabase as any).from(table).select("*", { count: "exact", head: true });
      if (error) throw new Error(`Table '${table}' missing or inaccessible: ${error.message}`);
    }
  });

  await run("database", "deal_number auto-generated as DL-YYYY-NNNNN", async () => {
    const year = new Date().getFullYear().toString();
    const { data: d1 } = await supabase.from("deals").insert({ notes: "integration_test" }).select("deal_number").single();
    const { data: d2 } = await supabase.from("deals").insert({ notes: "integration_test" }).select("deal_number").single();
    if (!d1?.deal_number.match(/^DL-\d{4}-\d{5}$/)) throw new Error(`Bad format: ${d1?.deal_number}`);
    if (d1.deal_number.slice(3, 7) !== year) throw new Error("Year mismatch in deal_number");
    const seq1 = parseInt(d1.deal_number.slice(8), 10);
    const seq2 = parseInt(d2!.deal_number.slice(8), 10);
    if (seq2 !== seq1 + 1) throw new Error(`Sequence not incrementing: ${seq1} → ${seq2}`);
    await supabase.from("deals").delete().eq("deal_number", d1.deal_number);
    await supabase.from("deals").delete().eq("deal_number", d2!.deal_number);
  });

  await run("database", "deal_status enum has 45 values", async () => {
    const { error } = await supabase.from("deals").insert({ status: "NOT_A_STATUS" as never, notes: "integration_test" });
    if (!error) throw new Error("Invalid deal_status must be rejected");
    const { data, error: e2 } = await supabase.from("deals").insert({ status: "DEAL_FULFILLED", notes: "integration_test" }).select("id,status").single();
    if (e2) throw new Error(`DEAL_FULFILLED must be valid: ${e2.message}`);
    await supabase.from("deals").delete().eq("id", data!.id);
  });

  await run("database", "FK constraint: buyer with invalid deal_id rejected", async () => {
    const { error } = await supabase.from("buyers").insert({ deal_id: "00000000-0000-0000-0000-000000000000", phone: "+27821234567", full_name: "Ghost" });
    if (!error) throw new Error("FK violation must be raised");
  });

  await run("database", "audit_events: UPDATE blocked by trigger", async () => {
    const dealId = await createTestDeal();
    const { data: evt } = await supabase.from("audit_events")
      .insert({ deal_id: dealId, event_type: "TEST", actor: "runner", actor_type: "SYSTEM", details: {} })
      .select("id").single();
    const { error } = await supabase.from("audit_events").update({ actor: "hacked" }).eq("id", evt!.id);
    await supabase.from("deals").delete().eq("id", dealId);
    if (!error) throw new Error("UPDATE on audit_events must fail");
  });

  await run("database", "audit_events: DELETE blocked by trigger", async () => {
    const dealId = await createTestDeal();
    const { data: evt } = await supabase.from("audit_events")
      .insert({ deal_id: dealId, event_type: "TEST", actor: "runner", actor_type: "SYSTEM", details: {} })
      .select("id").single();
    const { error } = await supabase.from("audit_events").delete().eq("id", evt!.id);
    await supabase.from("deals").delete().eq("id", dealId);
    if (!error) throw new Error("DELETE on audit_events must fail");
  });

  await run("database", "updated_at trigger fires on deal update", async () => {
    const { data: deal } = await supabase.from("deals").insert({ notes: "integration_test" }).select("id,updated_at").single();
    await new Promise((r) => setTimeout(r, 10));
    const { data: updated } = await supabase.from("deals").update({ notes: "changed" }).eq("id", deal!.id).select("updated_at").single();
    await supabase.from("deals").delete().eq("id", deal!.id);
    if (updated!.updated_at === deal!.updated_at) throw new Error("updated_at did not change");
  });
}

// ─── Suite 2: Deal Flow ───────────────────────────────────────────────────────

async function runDealFlowSuite() {
  console.log("\n[Suite 2] End-to-End Deal Flow");

  await run("deal-flow", "complete 21-step lifecycle", async () => {
    // Create deal
    const { data: deal } = await supabase.from("deals").insert({ status: "APPLICATION_INITIATED", notes: "integration_test" }).select("id,deal_number,status").single();
    if (!deal?.deal_number.match(/^DL-\d{4}-\d{5}$/)) throw new Error("Bad deal_number");
    if (deal.status !== "APPLICATION_INITIATED") throw new Error("Wrong initial status");
    const dealId = deal.id;

    // Create buyer
    const { data: buyer, error: be } = await supabase.from("buyers").insert({ deal_id: dealId, full_name: "Test Buyer", phone: "+27821110099" }).select("id").single();
    if (be) throw new Error(`Buyer: ${be.message}`);

    // Create documents
    const { data: docs, error: de } = await supabase.from("documents").insert([
      { deal_id: dealId, party: "BUYER", doc_type: "SA_ID_SMART_CARD" },
      { deal_id: dealId, party: "BUYER", doc_type: "BANK_STATEMENT" },
    ]).select("id,doc_type");
    if (de) throw new Error(`Docs: ${de.message}`);
    if (docs!.length !== 2) throw new Error("Expected 2 docs");

    // Extraction results
    const { error: ee } = await supabase.from("extraction_results").insert([
      { document_id: docs![0].id, field_name: "full_name", extracted_value: "TEST BUYER", confidence: 0.97 },
      { document_id: docs![0].id, field_name: "id_number", extracted_value: "9001015009087", confidence: 0.85 },
    ]);
    if (ee) throw new Error(`Extraction: ${ee.message}`);

    // Verification check
    const { error: ve } = await supabase.from("verification_checks").insert({ deal_id: dealId, check_type: "NAME_MATCH", result: "MATCH" });
    if (ve) throw new Error(`Verification: ${ve.message}`);

    // Status: BUYER_CONFIRMED
    await supabase.from("deals").update({ status: "BUYER_CONFIRMED" }).eq("id", dealId);

    // Create seller
    const { error: se } = await supabase.from("sellers").insert({ deal_id: dealId, full_name: "Test Seller", phone: "+27831110099" });
    if (se) throw new Error(`Seller: ${se.message}`);

    // Create vehicle
    const { data: vehicle, error: vve } = await supabase.from("vehicles").insert({ deal_id: dealId, make: "BMW", model: "3 Series", year: 2019 }).select("id").single();
    if (vve) throw new Error(`Vehicle: ${vve.message}`);

    // Photo set + photos
    const { data: photoSet } = await supabase.from("vehicle_photo_sets").insert({ deal_id: dealId, vehicle_id: vehicle!.id }).select("id").single();
    const angles = ["FRONT_VIEW","REAR_VIEW","LEFT_SIDE","RIGHT_SIDE","FRONT_LEFT_ANGLE","FRONT_RIGHT_ANGLE","ODOMETER","INTERIOR_DASHBOARD","ENGINE_BAY"];
    const { data: photos, error: pe } = await supabase.from("vehicle_photos").insert(angles.map((a) => ({ photo_set_id: photoSet!.id, angle_type: a, file_url: `https://s3.example.com/${a}.jpg`, quality_score: 85 }))).select("quality_status");
    if (pe) throw new Error(`Photos: ${pe.message}`);
    if (photos!.some((p: any) => p.quality_status !== "ACCEPTED")) throw new Error("Photos not ACCEPTED");

    // Evaluation
    const { data: eval_, error: evale } = await supabase.from("vehicle_quick_evaluations")
      .insert({ deal_id: dealId, vehicle_id: vehicle!.id, photo_set_id: photoSet!.id, condition_band: "GOOD", overall_confidence: 0.88, damage_items: [], recommendation: "Good" })
      .select("requires_manual_review").single();
    if (evale) throw new Error(`Eval: ${evale.message}`);
    if (eval_!.requires_manual_review !== false) throw new Error("Should not require manual review");

    // Quote
    const { data: quote, error: qe } = await supabase.from("quotes").insert({ deal_id: dealId, finance_amount: 200000, term_months: 60, interest_rate: 11.25, monthly_instalment: 4500 }).select("id,status").single();
    if (qe) throw new Error(`Quote: ${qe.message}`);
    if (quote!.status !== "DRAFT") throw new Error("Quote must start as DRAFT");

    // Accept quote
    await supabase.from("quotes").update({ status: "ACCEPTED" }).eq("id", quote!.id);

    // Inspection
    const { error: ie } = await supabase.from("inspections").insert({ deal_id: dealId, vehicle_id: vehicle!.id, inspector_name: "Hartcon" });
    if (ie) throw new Error(`Inspection: ${ie.message}`);

    // Contracts + signature events
    const { data: contracts, error: ce } = await supabase.from("contracts").insert([
      { deal_id: dealId, contract_type: "SELLER_AGREEMENT" },
      { deal_id: dealId, contract_type: "BUYER_FINANCE_AGREEMENT" },
    ]).select("id,signature_status");
    if (ce) throw new Error(`Contracts: ${ce.message}`);
    if (contracts!.some((c: any) => c.signature_status !== "PENDING")) throw new Error("Contracts not PENDING");

    const { error: sige } = await supabase.from("signature_events").insert([
      { contract_id: contracts![0].id, event_type: "SIGNED", signatory: "Seller" },
      { contract_id: contracts![1].id, event_type: "SIGNED", signatory: "Buyer" },
    ]);
    if (sige) throw new Error(`Signature events: ${sige.message}`);

    // Approve + fulfil
    await supabase.from("deals").update({ status: "DEAL_APPROVED" }).eq("id", dealId);
    const { error: nate } = await supabase.from("natis_fulfilments").insert({ deal_id: dealId });
    if (nate) throw new Error(`NATIS: ${nate.message}`);
    await supabase.from("deals").update({ status: "DEAL_FULFILLED" }).eq("id", dealId);

    // Audit trail
    const { data: finalDeal } = await supabase.from("deals").select("status").eq("id", dealId).single();
    if (finalDeal!.status !== "DEAL_FULFILLED") throw new Error("Final status must be DEAL_FULFILLED");

    // Cleanup
    await supabase.from("deals").delete().eq("id", dealId);
  });
}

// ─── Suite 3: Photo & Evaluation ─────────────────────────────────────────────

async function runPhotoSuite() {
  console.log("\n[Suite 3] Photo & Evaluation");

  async function makeScaffold() {
    const dealId = await createTestDeal();
    const { data: v } = await supabase.from("vehicles").insert({ deal_id: dealId, make: "T", model: "T", year: 2020 }).select("id").single();
    const { data: ps } = await supabase.from("vehicle_photo_sets").insert({ deal_id: dealId, vehicle_id: v!.id }).select("id").single();
    return { dealId, vehicleId: v!.id, photoSetId: ps!.id };
  }

  await run("photos", "mandatory_received increments one-by-one", async () => {
    const { dealId, photoSetId } = await makeScaffold();
    const angles = ["FRONT_VIEW","REAR_VIEW","LEFT_SIDE"];
    for (let i = 0; i < angles.length; i++) {
      await supabase.from("vehicle_photos").insert({ photo_set_id: photoSetId, angle_type: angles[i], file_url: `https://s3/${angles[i]}.jpg`, quality_score: 85 });
      const { data: ps } = await supabase.from("vehicle_photo_sets").select("mandatory_received").eq("id", photoSetId).single();
      if (ps!.mandatory_received !== i + 1) throw new Error(`Expected ${i + 1} got ${ps!.mandatory_received}`);
    }
    await supabase.from("deals").delete().eq("id", dealId);
  });

  await run("photos", "quality_score 85 → ACCEPTED", async () => {
    const { dealId, photoSetId } = await makeScaffold();
    const { data: p } = await supabase.from("vehicle_photos").insert({ photo_set_id: photoSetId, angle_type: "FRONT_VIEW", file_url: "https://s3/f.jpg", quality_score: 85 }).select("quality_status").single();
    await supabase.from("deals").delete().eq("id", dealId);
    if (p!.quality_status !== "ACCEPTED") throw new Error(`Expected ACCEPTED, got ${p!.quality_status}`);
  });

  await run("photos", "quality_score 65 → ACCEPTED_WITH_WARNING", async () => {
    const { dealId, photoSetId } = await makeScaffold();
    const { data: p } = await supabase.from("vehicle_photos").insert({ photo_set_id: photoSetId, angle_type: "REAR_VIEW", file_url: "https://s3/r.jpg", quality_score: 65 }).select("quality_status").single();
    await supabase.from("deals").delete().eq("id", dealId);
    if (p!.quality_status !== "ACCEPTED_WITH_WARNING") throw new Error(`Expected ACCEPTED_WITH_WARNING, got ${p!.quality_status}`);
  });

  await run("photos", "quality_score 42 → REJECTED", async () => {
    const { dealId, photoSetId } = await makeScaffold();
    const { data: p } = await supabase.from("vehicle_photos").insert({ photo_set_id: photoSetId, angle_type: "LEFT_SIDE", file_url: "https://s3/l.jpg", quality_score: 42 }).select("quality_status").single();
    await supabase.from("deals").delete().eq("id", dealId);
    if (p!.quality_status !== "REJECTED") throw new Error(`Expected REJECTED, got ${p!.quality_status}`);
  });

  await run("evaluation", "confidence 0.55 → requires_manual_review = true", async () => {
    const { dealId, vehicleId, photoSetId } = await makeScaffold();
    const { data: e } = await supabase.from("vehicle_quick_evaluations").insert({ deal_id: dealId, vehicle_id: vehicleId, photo_set_id: photoSetId, condition_band: "FAIR", overall_confidence: 0.55, damage_items: [], recommendation: "Test" }).select("requires_manual_review").single();
    await supabase.from("deals").delete().eq("id", dealId);
    if (e!.requires_manual_review !== true) throw new Error("Expected requires_manual_review=true");
  });

  await run("evaluation", "SEVERE damage → requires_manual_review = true", async () => {
    const { dealId, vehicleId, photoSetId } = await makeScaffold();
    const { data: e } = await supabase.from("vehicle_quick_evaluations").insert({ deal_id: dealId, vehicle_id: vehicleId, photo_set_id: photoSetId, condition_band: "POOR", overall_confidence: 0.82, damage_items: [{ severity: "SEVERE", description: "Crash damage" }], recommendation: "Test" }).select("requires_manual_review").single();
    await supabase.from("deals").delete().eq("id", dealId);
    if (e!.requires_manual_review !== true) throw new Error("Expected requires_manual_review=true for SEVERE");
  });

  await run("evaluation", "confidence 0.85 + no SEVERE → requires_manual_review = false", async () => {
    const { dealId, vehicleId, photoSetId } = await makeScaffold();
    const { data: e } = await supabase.from("vehicle_quick_evaluations").insert({ deal_id: dealId, vehicle_id: vehicleId, photo_set_id: photoSetId, condition_band: "GOOD", overall_confidence: 0.85, damage_items: [{ severity: "MINOR", description: "Scratch" }], recommendation: "Good" }).select("requires_manual_review").single();
    await supabase.from("deals").delete().eq("id", dealId);
    if (e!.requires_manual_review !== false) throw new Error("Expected requires_manual_review=false");
  });

  await run("evaluation", "complete record has all required fields", async () => {
    const { dealId, vehicleId, photoSetId } = await makeScaffold();
    const { data: e, error } = await supabase.from("vehicle_quick_evaluations").insert({ deal_id: dealId, vehicle_id: vehicleId, photo_set_id: photoSetId, condition_band: "EXCELLENT", overall_confidence: 0.94, damage_items: [], recommendation: "Excellent" }).select("*").single();
    await supabase.from("deals").delete().eq("id", dealId);
    if (error) throw new Error(error.message);
    if (!e!.disclaimer) throw new Error("disclaimer must have default");
    if (!e!.condition_band) throw new Error("condition_band missing");
    if (!e!.recommendation) throw new Error("recommendation missing");
  });
}

// ─── Suite 4: Notifications ───────────────────────────────────────────────────

async function runNotificationSuite() {
  console.log("\n[Suite 4] Notifications");

  await run("notifications", "created with QUEUED status", async () => {
    const dealId = await createTestDeal();
    const { data: n, error } = await supabase.from("notifications").insert({ deal_id: dealId, channel: "WHATSAPP", recipient_phone: "+27821234567", message_body: "test" }).select("status").single();
    await supabase.from("deals").delete().eq("id", dealId);
    if (error) throw new Error(error.message);
    if (n!.status !== "QUEUED") throw new Error(`Expected QUEUED, got ${n!.status}`);
  });

  await run("notifications", "QUEUED → SENT → DELIVERED lifecycle", async () => {
    const dealId = await createTestDeal();
    const { data: n } = await supabase.from("notifications").insert({ deal_id: dealId, channel: "SMS", recipient_phone: "+27821234567", message_body: "test" }).select("id").single();
    await supabase.from("notifications").update({ status: "SENT", sent_at: new Date().toISOString() }).eq("id", n!.id);
    const { data: delivered } = await supabase.from("notifications").update({ status: "DELIVERED", delivered_at: new Date().toISOString() }).eq("id", n!.id).select("status,delivered_at").single();
    await supabase.from("deals").delete().eq("id", dealId);
    if (delivered!.status !== "DELIVERED") throw new Error("Must reach DELIVERED");
    if (!delivered!.delivered_at) throw new Error("delivered_at must be set");
  });

  await run("notifications", "all 3 channels (WHATSAPP, SMS, EMAIL) stored correctly", async () => {
    const dealId = await createTestDeal();
    const { data: notifs, error } = await supabase.from("notifications").insert([
      { deal_id: dealId, channel: "WHATSAPP", recipient_phone: "+27821234567", message_body: "wa" },
      { deal_id: dealId, channel: "SMS", recipient_phone: "+27821234567", message_body: "sms" },
      { deal_id: dealId, channel: "EMAIL", recipient_email: "t@t.com", message_body: "email" },
    ]).select("channel");
    await supabase.from("deals").delete().eq("id", dealId);
    if (error) throw new Error(error.message);
    if (notifs!.length !== 3) throw new Error("Expected 3 notifications");
    const channels = notifs!.map((n: any) => n.channel).sort();
    if (JSON.stringify(channels) !== JSON.stringify(["EMAIL","SMS","WHATSAPP"])) throw new Error("Channel mismatch");
  });

  await run("notifications", "invalid channel rejected", async () => {
    const dealId = await createTestDeal();
    const { error } = await supabase.from("notifications").insert({ deal_id: dealId, channel: "TELEGRAM" as never, message_body: "test" });
    await supabase.from("deals").delete().eq("id", dealId);
    if (!error) throw new Error("Invalid channel must be rejected");
  });
}

// ─── Suite 5: Task Queue ──────────────────────────────────────────────────────

async function runTaskQueueSuite() {
  console.log("\n[Suite 5] Task Queue");

  await run("tasks", "Q_BUYER_DOC_REVIEW created with PENDING status", async () => {
    const dealId = await createTestDeal();
    const { data: t, error } = await supabase.from("tasks").insert({ deal_id: dealId, task_type: "REVIEW_DOCS", queue: "Q_BUYER_DOC_REVIEW" }).select("queue,status").single();
    await supabase.from("deals").delete().eq("id", dealId);
    if (error) throw new Error(error.message);
    if (t!.status !== "PENDING") throw new Error(`Expected PENDING, got ${t!.status}`);
    if (t!.queue !== "Q_BUYER_DOC_REVIEW") throw new Error("Wrong queue");
  });

  await run("tasks", "URGENT priority task stored correctly", async () => {
    const dealId = await createTestDeal();
    const { data: t, error } = await supabase.from("tasks").insert({ deal_id: dealId, task_type: "REVIEW_PHOTOS", queue: "Q_SELLER_PHOTO_REVIEW", priority: "URGENT" }).select("priority").single();
    await supabase.from("deals").delete().eq("id", dealId);
    if (error) throw new Error(error.message);
    if (t!.priority !== "URGENT") throw new Error(`Expected URGENT, got ${t!.priority}`);
  });

  await run("tasks", "PENDING → IN_PROGRESS → COMPLETED lifecycle", async () => {
    const dealId = await createTestDeal();
    const { data: t } = await supabase.from("tasks").insert({ deal_id: dealId, task_type: "TEST", queue: "Q_DEAL_APPROVAL" }).select("id,status").single();
    if (t!.status !== "PENDING") throw new Error("Must start PENDING");
    await supabase.from("tasks").update({ status: "IN_PROGRESS" }).eq("id", t!.id);
    const { data: done } = await supabase.from("tasks").update({ status: "COMPLETED", completed_at: new Date().toISOString() }).eq("id", t!.id).select("status,completed_at").single();
    await supabase.from("deals").delete().eq("id", dealId);
    if (done!.status !== "COMPLETED") throw new Error("Must reach COMPLETED");
    if (!done!.completed_at) throw new Error("completed_at must be set");
  });

  await run("tasks", "task assignment updates assigned_to", async () => {
    const dealId = await createTestDeal();
    const agentId = "a0000000-0000-0000-0000-000000000099";
    const { data: t } = await supabase.from("tasks").insert({ deal_id: dealId, task_type: "TEST", queue: "Q_FNI_REVIEW" }).select("id,assigned_to").single();
    if (t!.assigned_to !== null) throw new Error("Must start unassigned");
    const { data: assigned, error } = await supabase.from("tasks").update({ assigned_to: agentId }).eq("id", t!.id).select("assigned_to").single();
    await supabase.from("deals").delete().eq("id", dealId);
    if (error) throw new Error(error.message);
    if (assigned!.assigned_to !== agentId) throw new Error("assigned_to not updated");
  });
}

// ─── Main: run all suites ─────────────────────────────────────────────────────

console.log("═══════════════════════════════════════════════════════");
console.log("  VehicleFinance Integration Test Suite");
console.log(`  Project: sahvfsoclzgsuewbiiah`);
console.log(`  Started: ${new Date().toISOString()}`);
console.log("═══════════════════════════════════════════════════════");

await runDatabaseSuite();
await runDealFlowSuite();
await runPhotoSuite();
await runNotificationSuite();
await runTaskQueueSuite();

// ─── Summary ──────────────────────────────────────────────────────────────────

const passed = results.filter((r) => r.passed).length;
const failed = results.filter((r) => !r.passed).length;
const total = results.length;

console.log("\n═══════════════════════════════════════════════════════");
console.log("  RESULTS SUMMARY");
console.log("═══════════════════════════════════════════════════════");
console.log(`  Total:   ${total}`);
console.log(`  Passed:  ${passed} ✓`);
console.log(`  Failed:  ${failed} ${failed > 0 ? "✗" : ""}`);
console.log(`  Rate:    ${((passed / total) * 100).toFixed(1)}%`);

if (failed > 0) {
  console.log("\n  FAILURES:");
  for (const r of results.filter((r) => !r.passed)) {
    console.log(`  ✗ [${r.suite}] ${r.name}`);
    console.log(`    ${r.error}`);
  }
}

console.log("═══════════════════════════════════════════════════════");
console.log(`  Finished: ${new Date().toISOString()}`);
console.log("═══════════════════════════════════════════════════════\n");

Deno.exit(failed > 0 ? 1 : 0);
