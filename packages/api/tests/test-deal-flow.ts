/**
 * test-deal-flow.ts — End-to-end deal lifecycle (21 steps)
 *
 * Run:  deno test --allow-env --allow-net packages/api/tests/test-deal-flow.ts
 *
 * Env:  SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { assertEquals, assertExists, assertMatch } from "jsr:@std/assert";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "https://sahvfsoclzgsuewbiiah.supabase.co";
const SUPABASE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

Deno.test("deal-flow: complete 21-step lifecycle", async () => {
  // ── Step 1: Create deal ──────────────────────────────────────────────────
  const { data: deal, error: e1 } = await supabase
    .from("deals")
    .insert({ status: "APPLICATION_INITIATED", notes: "integration_test" })
    .select("id,deal_number,status")
    .single();

  assertEquals(e1, null, `Step 1 create deal: ${e1?.message}`);
  assertExists(deal!.id, "Deal must have an id");
  assertEquals(deal!.status, "APPLICATION_INITIATED", "Initial status must be APPLICATION_INITIATED");
  assertMatch(deal!.deal_number, /^DL-\d{4}-\d{5}$/, "deal_number must be auto-generated");

  const dealId = deal!.id;

  // ── Step 2: Create buyer linked to deal ──────────────────────────────────
  const { data: buyer, error: e2 } = await supabase
    .from("buyers")
    .insert({
      deal_id: dealId,
      full_name: "Thabo Nkosi",
      id_number: "9001015009087",
      phone: "+27821110001",
      email: "thabo@example.com",
      monthly_income: 35000,
    })
    .select("id,deal_id,full_name")
    .single();

  assertEquals(e2, null, `Step 2 create buyer: ${e2?.message}`);
  assertEquals(buyer!.deal_id, dealId, "Buyer must link to deal");
  assertEquals(buyer!.full_name, "Thabo Nkosi");

  // ── Step 3: Create documents (ID, bank statement, proof of address) ───────
  const docInserts = [
    { deal_id: dealId, party: "BUYER", doc_type: "SA_ID_SMART_CARD", file_name: "id.jpg" },
    { deal_id: dealId, party: "BUYER", doc_type: "BANK_STATEMENT", file_name: "bank.pdf" },
    { deal_id: dealId, party: "BUYER", doc_type: "PROOF_OF_ADDRESS", file_name: "poa.pdf" },
  ];

  const { data: docs, error: e3 } = await supabase
    .from("documents")
    .insert(docInserts)
    .select("id,doc_type,status");

  assertEquals(e3, null, `Step 3 create documents: ${e3?.message}`);
  assertEquals(docs!.length, 3, "Three documents must be created");
  assertEquals(docs![0].status, "UPLOADED", "Default document status must be UPLOADED");

  const idDocId = docs!.find((d) => d.doc_type === "SA_ID_SMART_CARD")!.id;

  // ── Step 4: Create extraction results with varying confidence ─────────────
  const extractionData = [
    { document_id: idDocId, field_name: "full_name", extracted_value: "THABO NKOSI", confidence: 0.97 },
    { document_id: idDocId, field_name: "id_number", extracted_value: "9001015009087", confidence: 0.99 },
    { document_id: idDocId, field_name: "date_of_birth", extracted_value: "1990-01-01", confidence: 0.95 },
    { document_id: idDocId, field_name: "gender", extracted_value: "MALE", confidence: 0.72 },
  ];

  const { data: extractions, error: e4 } = await supabase
    .from("extraction_results")
    .insert(extractionData)
    .select("id,field_name,confidence,verification_status");

  assertEquals(e4, null, `Step 4 extraction results: ${e4?.message}`);
  assertEquals(extractions!.length, 4, "Four extraction results must be created");
  assertEquals(extractions![0].verification_status, "PENDING", "Default verification_status must be PENDING");

  // ── Step 5: Create verification check (name match) ────────────────────────
  const { data: verCheck, error: e5 } = await supabase
    .from("verification_checks")
    .insert({
      deal_id: dealId,
      check_type: "NAME_MATCH",
      field_compared: "full_name",
      doc_a_id: idDocId,
      result: "MATCH",
      severity: "INFO",
    })
    .select("id,check_type,result,resolution_status")
    .single();

  assertEquals(e5, null, `Step 5 verification check: ${e5?.message}`);
  assertEquals(verCheck!.check_type, "NAME_MATCH");
  assertEquals(verCheck!.resolution_status, "OPEN", "Default resolution_status must be OPEN");

  // ── Step 6: Update deal to BUYER_CONFIRMED ────────────────────────────────
  const { data: updatedDeal, error: e6 } = await supabase
    .from("deals")
    .update({ status: "BUYER_CONFIRMED" })
    .eq("id", dealId)
    .select("status")
    .single();

  assertEquals(e6, null, `Step 6 update to BUYER_CONFIRMED: ${e6?.message}`);
  assertEquals(updatedDeal!.status, "BUYER_CONFIRMED");

  // ── Step 7: Create seller ─────────────────────────────────────────────────
  const { data: seller, error: e7 } = await supabase
    .from("sellers")
    .insert({
      deal_id: dealId,
      full_name: "Sipho Dlamini",
      phone: "+27831110002",
      id_number: "8505155009081",
    })
    .select("id,deal_id,full_name")
    .single();

  assertEquals(e7, null, `Step 7 create seller: ${e7?.message}`);
  assertEquals(seller!.deal_id, dealId, "Seller must link to deal");

  // ── Step 8: Create vehicle ────────────────────────────────────────────────
  const { data: vehicle, error: e8 } = await supabase
    .from("vehicles")
    .insert({
      deal_id: dealId,
      make: "Toyota",
      model: "Hilux",
      year: 2020,
      colour: "Silver",
      vin: "AHTEZ29G309000001",
      registration_number: "CA 123-456",
      asking_price: 350000,
    })
    .select("id,deal_id,make,model")
    .single();

  assertEquals(e8, null, `Step 8 create vehicle: ${e8?.message}`);
  assertEquals(vehicle!.deal_id, dealId, "Vehicle must link to deal");
  assertEquals(vehicle!.make, "Toyota");

  // ── Step 9: Create vehicle_photo_set ──────────────────────────────────────
  const { data: photoSet, error: e9 } = await supabase
    .from("vehicle_photo_sets")
    .insert({
      deal_id: dealId,
      vehicle_id: vehicle!.id,
    })
    .select("id,mandatory_received,mandatory_required,coverage_score,status")
    .single();

  assertEquals(e9, null, `Step 9 create photo set: ${e9?.message}`);
  assertEquals(photoSet!.mandatory_received, 0, "New photo set: 0 mandatory received");
  assertEquals(photoSet!.mandatory_required, 9, "Photo set must require 9 mandatory angles");
  assertEquals(photoSet!.status, "PENDING");

  const photoSetId = photoSet!.id;

  // ── Step 10: Create 9 mandatory vehicle photos ────────────────────────────
  const mandatoryAngles = [
    "FRONT_VIEW", "REAR_VIEW", "LEFT_SIDE", "RIGHT_SIDE",
    "FRONT_LEFT_ANGLE", "FRONT_RIGHT_ANGLE",
    "ODOMETER", "INTERIOR_DASHBOARD", "ENGINE_BAY",
  ];

  const photoInserts = mandatoryAngles.map((angle_type) => ({
    photo_set_id: photoSetId,
    angle_type,
    file_url: `https://storage.example.com/${dealId}/${angle_type}.jpg`,
    quality_score: 88,
  }));

  const { data: photos, error: e10 } = await supabase
    .from("vehicle_photos")
    .insert(photoInserts)
    .select("id,angle_type,quality_score,quality_status");

  assertEquals(e10, null, `Step 10 insert photos: ${e10?.message}`);
  assertEquals(photos!.length, 9, "Nine mandatory photos must be created");

  // Verify quality trigger set status to ACCEPTED (score 88 >= 80)
  for (const p of photos!) {
    assertEquals(p.quality_status, "ACCEPTED", `Photo ${p.angle_type} quality_status should be ACCEPTED`);
  }

  // ── Step 11: Update photo_set status to COMPLETE ──────────────────────────
  const { data: updatedSet, error: e11 } = await supabase
    .from("vehicle_photo_sets")
    .update({ status: "COMPLETE" })
    .eq("id", photoSetId)
    .select("status,mandatory_received")
    .single();

  assertEquals(e11, null, `Step 11 update photo set: ${e11?.message}`);
  assertEquals(updatedSet!.status, "COMPLETE");
  assertEquals(updatedSet!.mandatory_received, 9, "All 9 mandatory photos should be counted");

  // ── Step 12: Create vehicle_quick_evaluation ──────────────────────────────
  const { data: evaluation, error: e12 } = await supabase
    .from("vehicle_quick_evaluations")
    .insert({
      deal_id: dealId,
      vehicle_id: vehicle!.id,
      photo_set_id: photoSetId,
      condition_band: "GOOD",
      overall_confidence: 0.88,
      damage_items: [
        { description: "Minor scratch on rear bumper", severity: "MINOR", location: "Rear bumper" },
      ],
      recommendation: "Vehicle is in good condition. Proceed with inspection.",
    })
    .select("id,condition_band,overall_confidence,requires_manual_review,disclaimer,recommendation")
    .single();

  assertEquals(e12, null, `Step 12 create evaluation: ${e12?.message}`);
  assertEquals(evaluation!.condition_band, "GOOD");
  assertEquals(evaluation!.requires_manual_review, false, "Confidence 0.88 + no SEVERE = no manual review");
  assertExists(evaluation!.disclaimer, "disclaimer must have default value");
  assertExists(evaluation!.recommendation, "recommendation must be stored");

  // ── Step 13: Create quote ─────────────────────────────────────────────────
  const { data: quote, error: e13 } = await supabase
    .from("quotes")
    .insert({
      deal_id: dealId,
      finance_amount: 280000,
      term_months: 72,
      interest_rate: 11.25,
      monthly_instalment: 5800,
      total_credit_cost: 417600,
    })
    .select("id,deal_id,status,finance_amount")
    .single();

  assertEquals(e13, null, `Step 13 create quote: ${e13?.message}`);
  assertEquals(quote!.deal_id, dealId, "Quote must link to deal");
  assertEquals(quote!.status, "DRAFT", "Default quote status must be DRAFT");

  // ── Step 14: Update quote status to ACCEPTED ──────────────────────────────
  const { data: acceptedQuote, error: e14 } = await supabase
    .from("quotes")
    .update({ status: "ACCEPTED", accepted_at: new Date().toISOString() })
    .eq("id", quote!.id)
    .select("status,accepted_at")
    .single();

  assertEquals(e14, null, `Step 14 accept quote: ${e14?.message}`);
  assertEquals(acceptedQuote!.status, "ACCEPTED");
  assertExists(acceptedQuote!.accepted_at);

  // ── Step 15: Create inspection ────────────────────────────────────────────
  const { data: inspection, error: e15 } = await supabase
    .from("inspections")
    .insert({
      deal_id: dealId,
      vehicle_id: vehicle!.id,
      inspector_name: "Hartcon Inspector",
      status: "PENDING",
    })
    .select("id,deal_id,status")
    .single();

  assertEquals(e15, null, `Step 15 create inspection: ${e15?.message}`);
  assertEquals(inspection!.deal_id, dealId);

  // ── Step 16: Create contracts (seller + buyer) ────────────────────────────
  const contractInserts = [
    { deal_id: dealId, contract_type: "SELLER_AGREEMENT", signatory_name: "Sipho Dlamini" },
    { deal_id: dealId, contract_type: "BUYER_FINANCE_AGREEMENT", signatory_name: "Thabo Nkosi" },
  ];

  const { data: contracts, error: e16 } = await supabase
    .from("contracts")
    .insert(contractInserts)
    .select("id,contract_type,signature_status");

  assertEquals(e16, null, `Step 16 create contracts: ${e16?.message}`);
  assertEquals(contracts!.length, 2, "Two contracts must be created");
  for (const c of contracts!) {
    assertEquals(c.signature_status, "PENDING", "Default signature_status must be PENDING");
  }

  const sellerContract = contracts!.find((c) => c.contract_type === "SELLER_AGREEMENT")!;
  const buyerContract = contracts!.find((c) => c.contract_type === "BUYER_FINANCE_AGREEMENT")!;

  // ── Step 17: Create signature events ─────────────────────────────────────
  const sigEvents = [
    { contract_id: sellerContract.id, event_type: "SENT", signatory: "Sipho Dlamini", ip_address: "192.168.1.1" },
    { contract_id: sellerContract.id, event_type: "SIGNED", signatory: "Sipho Dlamini", ip_address: "192.168.1.1" },
    { contract_id: buyerContract.id, event_type: "SENT", signatory: "Thabo Nkosi", ip_address: "10.0.0.1" },
    { contract_id: buyerContract.id, event_type: "SIGNED", signatory: "Thabo Nkosi", ip_address: "10.0.0.1" },
  ];

  const { data: sigEvts, error: e17 } = await supabase
    .from("signature_events")
    .insert(sigEvents)
    .select("id,contract_id,event_type,signatory");

  assertEquals(e17, null, `Step 17 create signature events: ${e17?.message}`);
  assertEquals(sigEvts!.length, 4, "Four signature events must be created");

  // ── Step 18: Update deal to DEAL_APPROVED ────────────────────────────────
  const { data: approvedDeal, error: e18 } = await supabase
    .from("deals")
    .update({ status: "DEAL_APPROVED" })
    .eq("id", dealId)
    .select("status")
    .single();

  assertEquals(e18, null, `Step 18 approve deal: ${e18?.message}`);
  assertEquals(approvedDeal!.status, "DEAL_APPROVED");

  // ── Step 19: Create natis_fulfilment ──────────────────────────────────────
  const { data: natis, error: e19 } = await supabase
    .from("natis_fulfilments")
    .insert({
      deal_id: dealId,
      collection_status: "PENDING",
      transfer_status: "PENDING",
    })
    .select("id,deal_id,collection_status,transfer_status")
    .single();

  assertEquals(e19, null, `Step 19 create natis fulfilment: ${e19?.message}`);
  assertEquals(natis!.deal_id, dealId);
  assertEquals(natis!.collection_status, "PENDING");

  // ── Step 20: Update deal to DEAL_FULFILLED ───────────────────────────────
  const { data: fulfilledDeal, error: e20 } = await supabase
    .from("deals")
    .update({ status: "DEAL_FULFILLED" })
    .eq("id", dealId)
    .select("status")
    .single();

  assertEquals(e20, null, `Step 20 fulfil deal: ${e20?.message}`);
  assertEquals(fulfilledDeal!.status, "DEAL_FULFILLED");

  // ── Step 21: Verify audit trail (audit_events) ───────────────────────────
  const auditEvents = [
    { deal_id: dealId, event_type: "DEAL_CREATED", actor: "system", actor_type: "SYSTEM", details: { deal_number: deal!.deal_number } },
    { deal_id: dealId, event_type: "BUYER_CONFIRMED", actor: "bot", actor_type: "SYSTEM", details: {} },
    { deal_id: dealId, event_type: "DEAL_APPROVED", actor: "ops_agent", actor_type: "SYSTEM", details: {} },
    { deal_id: dealId, event_type: "DEAL_FULFILLED", actor: "system", actor_type: "SYSTEM", details: {} },
  ];

  const { data: auditData, error: e21a } = await supabase
    .from("audit_events")
    .insert(auditEvents)
    .select("id,event_type,actor");

  assertEquals(e21a, null, `Step 21a insert audit events: ${e21a?.message}`);
  assertEquals(auditData!.length, 4, "Four audit events must be recorded");

  // Verify all audit events are retrievable
  const { data: allAudit, error: e21b } = await supabase
    .from("audit_events")
    .select("event_type")
    .eq("deal_id", dealId)
    .order("created_at");

  assertEquals(e21b, null);
  assertEquals(allAudit!.length, 4, "All 4 audit events must be found");
  assertEquals(allAudit![0].event_type, "DEAL_CREATED");
  assertEquals(allAudit![3].event_type, "DEAL_FULFILLED");

  // ── Cleanup: cascade delete from deal ────────────────────────────────────
  const { error: cleanup } = await supabase.from("deals").delete().eq("id", dealId);
  assertEquals(cleanup, null, `Cleanup cascade delete: ${cleanup?.message}`);
});
