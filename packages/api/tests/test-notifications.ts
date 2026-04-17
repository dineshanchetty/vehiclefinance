/**
 * test-notifications.ts — Notification creation, status tracking, channels
 *
 * Run:  deno test --allow-env --allow-net packages/api/tests/test-notifications.ts
 *
 * Env:  SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { assertEquals, assertExists, assertNotEquals } from "jsr:@std/assert";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "https://sahvfsoclzgsuewbiiah.supabase.co";
const SUPABASE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function createTestDeal(): Promise<string> {
  const { data } = await supabase
    .from("deals")
    .insert({ notes: "integration_test" })
    .select("id")
    .single();
  return data!.id;
}

// ─── Test: Notification creation with QUEUED default status ──────────────────

Deno.test("notifications: created with QUEUED status by default", async () => {
  const dealId = await createTestDeal();

  const { data: notif, error } = await supabase
    .from("notifications")
    .insert({
      deal_id: dealId,
      channel: "WHATSAPP",
      recipient_phone: "+27821234567",
      message_body: "Your application has been received.",
    })
    .select("id,status,channel,message_body,sent_at,delivered_at")
    .single();

  assertEquals(error, null, `Create notification: ${error?.message}`);
  assertEquals(notif!.status, "QUEUED", "Default status must be QUEUED");
  assertEquals(notif!.channel, "WHATSAPP");
  assertEquals(notif!.sent_at, null, "sent_at must be null for QUEUED notification");
  assertEquals(notif!.delivered_at, null, "delivered_at must be null for QUEUED notification");

  await supabase.from("deals").delete().eq("id", dealId);
});

// ─── Test: Status lifecycle QUEUED → SENT → DELIVERED ────────────────────────

Deno.test("notifications: status lifecycle QUEUED → SENT → DELIVERED", async () => {
  const dealId = await createTestDeal();

  const { data: notif } = await supabase
    .from("notifications")
    .insert({
      deal_id: dealId,
      channel: "SMS",
      recipient_phone: "+27821234567",
      message_body: "Your documents have been reviewed.",
    })
    .select("id,status")
    .single();

  assertEquals(notif!.status, "QUEUED");

  // → SENT
  const sentAt = new Date().toISOString();
  const { data: sent, error: e1 } = await supabase
    .from("notifications")
    .update({ status: "SENT", sent_at: sentAt })
    .eq("id", notif!.id)
    .select("status,sent_at")
    .single();

  assertEquals(e1, null, `Update to SENT: ${e1?.message}`);
  assertEquals(sent!.status, "SENT");
  assertExists(sent!.sent_at, "sent_at must be recorded");

  // → DELIVERED
  const deliveredAt = new Date().toISOString();
  const { data: delivered, error: e2 } = await supabase
    .from("notifications")
    .update({ status: "DELIVERED", delivered_at: deliveredAt })
    .eq("id", notif!.id)
    .select("status,delivered_at")
    .single();

  assertEquals(e2, null, `Update to DELIVERED: ${e2?.message}`);
  assertEquals(delivered!.status, "DELIVERED");
  assertExists(delivered!.delivered_at, "delivered_at must be recorded");

  await supabase.from("deals").delete().eq("id", dealId);
});

// ─── Test: QUEUED → FAILED with error_message ────────────────────────────────

Deno.test("notifications: QUEUED → FAILED records error_message", async () => {
  const dealId = await createTestDeal();

  const { data: notif } = await supabase
    .from("notifications")
    .insert({
      deal_id: dealId,
      channel: "EMAIL",
      recipient_email: "buyer@example.com",
      message_body: "Your quote is ready.",
    })
    .select("id")
    .single();

  const { data: failed, error } = await supabase
    .from("notifications")
    .update({
      status: "FAILED",
      error_message: "Delivery failed: recipient mailbox full",
    })
    .eq("id", notif!.id)
    .select("status,error_message")
    .single();

  assertEquals(error, null, `Update to FAILED: ${error?.message}`);
  assertEquals(failed!.status, "FAILED");
  assertEquals(failed!.error_message, "Delivery failed: recipient mailbox full");

  await supabase.from("deals").delete().eq("id", dealId);
});

// ─── Test: Multiple channels — WhatsApp, SMS, Email ──────────────────────────

Deno.test("notifications: all three channels (WHATSAPP, SMS, EMAIL) store correctly", async () => {
  const dealId = await createTestDeal();

  const channelInserts = [
    {
      deal_id: dealId,
      channel: "WHATSAPP",
      recipient_phone: "+27821234567",
      message_body: "WhatsApp: your deal is progressing.",
      template: "deal_progress_wa",
    },
    {
      deal_id: dealId,
      channel: "SMS",
      recipient_phone: "+27821234567",
      message_body: "SMS: your deal is progressing.",
    },
    {
      deal_id: dealId,
      channel: "EMAIL",
      recipient_email: "buyer@example.com",
      message_body: "Email: your deal is progressing.",
    },
  ];

  const { data: notifs, error } = await supabase
    .from("notifications")
    .insert(channelInserts)
    .select("id,channel,recipient_phone,recipient_email,status");

  assertEquals(error, null, `Insert multi-channel notifications: ${error?.message}`);
  assertEquals(notifs!.length, 3, "Three notifications must be created");

  const wa = notifs!.find((n) => n.channel === "WHATSAPP");
  const sms = notifs!.find((n) => n.channel === "SMS");
  const email = notifs!.find((n) => n.channel === "EMAIL");

  assertExists(wa, "WHATSAPP notification must exist");
  assertExists(sms, "SMS notification must exist");
  assertExists(email, "EMAIL notification must exist");

  assertEquals(wa!.recipient_phone, "+27821234567");
  assertEquals(sms!.recipient_phone, "+27821234567");
  assertEquals(email!.recipient_email, "buyer@example.com");

  for (const n of notifs!) {
    assertEquals(n.status, "QUEUED", `${n.channel} notification must default to QUEUED`);
  }

  await supabase.from("deals").delete().eq("id", dealId);
});

// ─── Test: Invalid channel is rejected ───────────────────────────────────────

Deno.test("notifications: invalid channel is rejected", async () => {
  const dealId = await createTestDeal();

  const { error } = await supabase
    .from("notifications")
    .insert({
      deal_id: dealId,
      channel: "TELEGRAM" as never,
      message_body: "test",
    });

  assertNotEquals(error, null, "Invalid channel must be rejected by DB constraint");

  await supabase.from("deals").delete().eq("id", dealId);
});

// ─── Test: Notification without deal_id (standalone) ─────────────────────────

Deno.test("notifications: can create without deal_id (system notifications)", async () => {
  const { data: notif, error } = await supabase
    .from("notifications")
    .insert({
      channel: "EMAIL",
      recipient_email: "ops@vehiclefinance.co.za",
      message_body: "System alert: queue backlog detected",
    })
    .select("id,deal_id,status")
    .single();

  assertEquals(error, null, `System notification: ${error?.message}`);
  assertEquals(notif!.deal_id, null, "deal_id must be nullable");
  assertEquals(notif!.status, "QUEUED");

  // Cleanup standalone notification
  await supabase.from("notifications").delete().eq("id", notif!.id);
});

// ─── Test: READ and BOUNCED are valid notification_status values ──────────────

Deno.test("notifications: all status values (QUEUED,SENT,DELIVERED,READ,FAILED) are valid", async () => {
  const dealId = await createTestDeal();
  const validStatuses = ["QUEUED", "SENT", "DELIVERED", "READ", "FAILED"] as const;

  for (const status of validStatuses) {
    const { data, error } = await supabase
      .from("notifications")
      .insert({
        deal_id: dealId,
        channel: "WHATSAPP",
        recipient_phone: "+27821234567",
        message_body: `Status test: ${status}`,
        status,
      })
      .select("id,status")
      .single();
    assertEquals(error, null, `Status '${status}' must be accepted: ${error?.message}`);
    assertEquals(data!.status, status);
  }

  await supabase.from("deals").delete().eq("id", dealId);
});
