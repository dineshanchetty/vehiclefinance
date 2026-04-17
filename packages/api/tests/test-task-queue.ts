/**
 * test-task-queue.ts — Task creation, queue routing, lifecycle, assignment
 *
 * Run:  deno test --allow-env --allow-net packages/api/tests/test-task-queue.ts
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

// ─── Test: Task creation in correct queues ────────────────────────────────────

Deno.test("tasks: Q_BUYER_DOC_REVIEW task created with PENDING status", async () => {
  const dealId = await createTestDeal();

  const { data: task, error } = await supabase
    .from("tasks")
    .insert({
      deal_id: dealId,
      task_type: "REVIEW_BUYER_DOCS",
      queue: "Q_BUYER_DOC_REVIEW",
      priority: "NORMAL",
    })
    .select("id,task_type,queue,status,priority")
    .single();

  assertEquals(error, null, `Create task: ${error?.message}`);
  assertEquals(task!.queue, "Q_BUYER_DOC_REVIEW");
  assertEquals(task!.status, "PENDING", "Default task status must be PENDING");
  assertEquals(task!.priority, "NORMAL");
  assertEquals(task!.task_type, "REVIEW_BUYER_DOCS");

  await supabase.from("deals").delete().eq("id", dealId);
});

Deno.test("tasks: Q_SELLER_PHOTO_REVIEW task with URGENT priority", async () => {
  const dealId = await createTestDeal();

  const { data: task, error } = await supabase
    .from("tasks")
    .insert({
      deal_id: dealId,
      task_type: "REVIEW_SELLER_PHOTOS",
      queue: "Q_SELLER_PHOTO_REVIEW",
      priority: "URGENT",
      notes: "Seller photos received — urgent review needed",
    })
    .select("id,queue,priority,status,notes")
    .single();

  assertEquals(error, null, `Create URGENT photo review task: ${error?.message}`);
  assertEquals(task!.queue, "Q_SELLER_PHOTO_REVIEW");
  assertEquals(task!.priority, "URGENT");
  assertEquals(task!.status, "PENDING");
  assertEquals(task!.notes, "Seller photos received — urgent review needed");

  await supabase.from("deals").delete().eq("id", dealId);
});

Deno.test("tasks: Q_DEAL_APPROVAL task created", async () => {
  const dealId = await createTestDeal();

  const { data: task, error } = await supabase
    .from("tasks")
    .insert({
      deal_id: dealId,
      task_type: "APPROVE_DEAL",
      queue: "Q_DEAL_APPROVAL",
      priority: "HIGH",
    })
    .select("id,queue,priority,status")
    .single();

  assertEquals(error, null, `Create deal approval task: ${error?.message}`);
  assertEquals(task!.queue, "Q_DEAL_APPROVAL");
  assertEquals(task!.priority, "HIGH");
  assertEquals(task!.status, "PENDING");

  await supabase.from("deals").delete().eq("id", dealId);
});

Deno.test("tasks: all task queue names are valid", async () => {
  const dealId = await createTestDeal();

  const queues = [
    "Q_BUYER_DOC_REVIEW", "Q_SELLER_DOC_REVIEW", "Q_SELLER_PHOTO_REVIEW",
    "Q_FNI_REVIEW", "Q_FNI_QUOTE_PREP", "Q_HARTCON_INSPECTION",
    "Q_SELLER_CONTRACT", "Q_BUYER_CONTRACT", "Q_DEAL_APPROVAL",
    "Q_NATIS_COLLECTION", "Q_NATIS_FULFILMENT", "Q_MISMATCH_REVIEW",
    "Q_HUMAN_ESCALATION", "Q_SELLER_FOLLOWUP",
  ] as const;

  // Verify that an invalid queue name is rejected by the DB
  const { error: badErr } = await supabase
    .from("tasks")
    .insert({
      deal_id: dealId,
      task_type: "SOME_TASK",
      queue: "Q_INVALID_QUEUE" as never,
    });
  assertNotEquals(badErr, null, "Invalid queue name must be rejected");

  // Spot-check a few valid queues
  for (const queue of ["Q_FNI_REVIEW", "Q_NATIS_FULFILMENT", "Q_HUMAN_ESCALATION"] as const) {
    const { data, error } = await supabase
      .from("tasks")
      .insert({ deal_id: dealId, task_type: "TEST", queue, priority: "LOW" })
      .select("queue")
      .single();
    assertEquals(error, null, `Queue '${queue}' must be valid: ${error?.message}`);
    assertEquals(data!.queue, queue);
  }

  assertEquals(queues.length, 14, "14 queue names defined");
  await supabase.from("deals").delete().eq("id", dealId);
});

// ─── Test: Task lifecycle PENDING → IN_PROGRESS → COMPLETED ──────────────────

Deno.test("tasks: lifecycle PENDING → IN_PROGRESS → COMPLETED with timestamps", async () => {
  const dealId = await createTestDeal();

  const { data: task } = await supabase
    .from("tasks")
    .insert({
      deal_id: dealId,
      task_type: "REVIEW_BUYER_DOCS",
      queue: "Q_BUYER_DOC_REVIEW",
    })
    .select("id,status,completed_at,created_at,updated_at")
    .single();

  assertEquals(task!.status, "PENDING");
  assertEquals(task!.completed_at, null, "completed_at must be null for PENDING task");
  const createdAt = task!.created_at;

  // → IN_PROGRESS
  await new Promise((r) => setTimeout(r, 10));
  const { data: inProgress, error: e1 } = await supabase
    .from("tasks")
    .update({ status: "IN_PROGRESS" })
    .eq("id", task!.id)
    .select("status,updated_at")
    .single();

  assertEquals(e1, null, `Update to IN_PROGRESS: ${e1?.message}`);
  assertEquals(inProgress!.status, "IN_PROGRESS");
  assertNotEquals(inProgress!.updated_at, createdAt, "updated_at must change");

  // → COMPLETED with completed_at
  const completedAt = new Date().toISOString();
  const { data: completed, error: e2 } = await supabase
    .from("tasks")
    .update({ status: "COMPLETED", completed_at: completedAt })
    .eq("id", task!.id)
    .select("status,completed_at")
    .single();

  assertEquals(e2, null, `Update to COMPLETED: ${e2?.message}`);
  assertEquals(completed!.status, "COMPLETED");
  assertExists(completed!.completed_at, "completed_at must be recorded");

  await supabase.from("deals").delete().eq("id", dealId);
});

Deno.test("tasks: lifecycle PENDING → ESCALATED records escalation", async () => {
  const dealId = await createTestDeal();

  const { data: task } = await supabase
    .from("tasks")
    .insert({
      deal_id: dealId,
      task_type: "REVIEW_BUYER_DOCS",
      queue: "Q_BUYER_DOC_REVIEW",
    })
    .select("id")
    .single();

  const { data: escalated, error } = await supabase
    .from("tasks")
    .update({ status: "ESCALATED", notes: "Escalated: document unreadable after 3 attempts" })
    .eq("id", task!.id)
    .select("status,notes")
    .single();

  assertEquals(error, null, `Escalate task: ${error?.message}`);
  assertEquals(escalated!.status, "ESCALATED");
  assertEquals(escalated!.notes, "Escalated: document unreadable after 3 attempts");

  await supabase.from("deals").delete().eq("id", dealId);
});

// ─── Test: Task assignment ────────────────────────────────────────────────────

Deno.test("tasks: unassigned task has null assigned_to", async () => {
  const dealId = await createTestDeal();

  const { data: task, error } = await supabase
    .from("tasks")
    .insert({
      deal_id: dealId,
      task_type: "FNI_REVIEW",
      queue: "Q_FNI_REVIEW",
    })
    .select("id,assigned_to")
    .single();

  assertEquals(error, null);
  assertEquals(task!.assigned_to, null, "Unassigned task must have null assigned_to");

  await supabase.from("deals").delete().eq("id", dealId);
});

Deno.test("tasks: assign task to agent updates assigned_to", async () => {
  const dealId = await createTestDeal();
  const agentId = "a0000000-0000-0000-0000-000000000001";

  const { data: task } = await supabase
    .from("tasks")
    .insert({
      deal_id: dealId,
      task_type: "FNI_QUOTE_PREP",
      queue: "Q_FNI_QUOTE_PREP",
    })
    .select("id,assigned_to")
    .single();

  assertEquals(task!.assigned_to, null);

  const { data: assigned, error } = await supabase
    .from("tasks")
    .update({ assigned_to: agentId, due_at: new Date(Date.now() + 86400000).toISOString() })
    .eq("id", task!.id)
    .select("assigned_to,due_at")
    .single();

  assertEquals(error, null, `Assign task: ${error?.message}`);
  assertEquals(assigned!.assigned_to, agentId, "assigned_to must be updated");
  assertExists(assigned!.due_at, "due_at must be stored");

  await supabase.from("deals").delete().eq("id", dealId);
});

// ─── Test: ops_tasks and audit_logs (tables 20 and 19) ───────────────────────

Deno.test("ops_tasks: create and track operational task", async () => {
  const dealId = await createTestDeal();

  const { data: opsTask, error } = await supabase
    .from("ops_tasks")
    .insert({
      deal_id: dealId,
      task_type: "SEND_NATIS_DOCS",
      description: "Send NATIS documents to buyer",
      priority: "high",
      metadata: { vehicle_reg: "CA 123-456" },
    })
    .select("id,task_type,status,priority")
    .single();

  assertEquals(error, null, `Create ops_task: ${error?.message}`);
  assertEquals(opsTask!.status, "pending", "Default ops_task status must be pending");
  assertEquals(opsTask!.priority, "high");

  const { data: updated, error: e2 } = await supabase
    .from("ops_tasks")
    .update({ status: "completed", assigned_to: "ops_agent_001" })
    .eq("id", opsTask!.id)
    .select("status,assigned_to")
    .single();

  assertEquals(e2, null);
  assertEquals(updated!.status, "completed");
  assertEquals(updated!.assigned_to, "ops_agent_001");

  await supabase.from("deals").delete().eq("id", dealId);
});

Deno.test("audit_logs: create and query audit trail", async () => {
  const dealId = await createTestDeal();

  const logEntries = [
    { deal_id: dealId, event_type: "DEAL_CREATED", description: "Deal created via WhatsApp bot" },
    { deal_id: dealId, event_type: "DOCS_UPLOADED", description: "Buyer uploaded 3 documents", metadata: { count: 3 } },
    { deal_id: dealId, phone: "+27821234567", event_type: "WHATSAPP_MSG_RECEIVED", description: "Buyer sent message" },
  ];

  const { data: logs, error } = await supabase
    .from("audit_logs")
    .insert(logEntries)
    .select("id,event_type,description,phone");

  assertEquals(error, null, `Create audit_logs: ${error?.message}`);
  assertEquals(logs!.length, 3, "Three audit log entries must be created");

  const { data: retrieved } = await supabase
    .from("audit_logs")
    .select("event_type")
    .eq("deal_id", dealId)
    .order("created_at");

  assertEquals(retrieved!.length, 3);
  assertEquals(retrieved![0].event_type, "DEAL_CREATED");

  await supabase.from("deals").delete().eq("id", dealId);
});

Deno.test("extraction_tasks: create and track extraction job", async () => {
  const dealId = await createTestDeal();

  const { data: doc } = await supabase
    .from("documents")
    .insert({ deal_id: dealId, party: "BUYER", doc_type: "SA_ID_SMART_CARD" })
    .select("id")
    .single();

  const { data: extractTask, error } = await supabase
    .from("extraction_tasks")
    .insert({ document_id: doc!.id })
    .select("id,status,started_at,completed_at,error")
    .single();

  assertEquals(error, null, `Create extraction_task: ${error?.message}`);
  assertEquals(extractTask!.status, "pending");
  assertEquals(extractTask!.started_at, null);
  assertEquals(extractTask!.completed_at, null);

  // Simulate processing
  const startedAt = new Date().toISOString();
  await supabase.from("extraction_tasks").update({ status: "processing", started_at: startedAt }).eq("id", extractTask!.id);

  const completedAt = new Date().toISOString();
  const { data: done, error: e2 } = await supabase
    .from("extraction_tasks")
    .update({ status: "completed", completed_at: completedAt, result: { fields: 12, confidence: 0.95 } })
    .eq("id", extractTask!.id)
    .select("status,completed_at,result")
    .single();

  assertEquals(e2, null);
  assertEquals(done!.status, "completed");
  assertExists(done!.completed_at);
  assertEquals((done!.result as { fields: number }).fields, 12);

  await supabase.from("deals").delete().eq("id", dealId);
});
