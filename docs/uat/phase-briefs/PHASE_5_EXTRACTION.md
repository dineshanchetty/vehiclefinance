# Phase 5 — Document extraction (Worker brief)

Your job: turn the `trigger_extraction` placeholder into a real pipeline
that extracts structured fields from South African ID documents, bank
statements, and proof-of-address documents. Confidence-scored. Human
review UI for low-confidence fields.

## Absolute non-negotiables

- Work in your isolated worktree; commit + push.
- Use **Claude vision** (Anthropic SDK already in bot's deps). Do not add
  Google Document AI / AWS Textract unless you find Claude vision genuinely
  can't handle it — then report the finding and stop.
- No real PII in any test fixture. Use synthetic / generated samples.
- Extraction must cost-bound: if a document is > 20 MB or > 20 pages,
  reject it with a clear error.

## Deliverables

### 5.1 Edge Function: `packages/api/supabase/functions/extract-document/`

- `deno.json`: `{ "imports": { "@supabase/supabase-js": "npm:@supabase/supabase-js@^2", "@anthropic-ai/sdk": "npm:@anthropic-ai/sdk@^0.89" } }`.
- `index.ts`: HTTP handler that accepts `POST { document_id: uuid }`:
  1. Fetch the `documents` row.
  2. If `doc_type` is not extractable (e.g. `OTHER`), return 400.
  3. Download the file from Supabase Storage (bucket `documents`, path from `documents.file_url` or a storage path column — add a `storage_path` column via migration if missing).
  4. Size / page guard.
  5. Call Claude vision with a doc-type-specific structured-output prompt
     (see 5.2). Model: `claude-sonnet-4-5` (or latest available sonnet).
  6. Parse the JSON response.
  7. For each field: insert a row into `extraction_results` with
     `field_name`, `extracted_value`, `confidence` (0..1), `source_location`
     (JSON hint from Claude), `verification_status` = `'PENDING'`.
  8. Update `extraction_tasks.status` to `'completed'` with `result` populated.
  9. If overall confidence < 0.80, insert a `Q_MISMATCH_REVIEW` task on the deal.
- Handle errors by setting `extraction_tasks.status='failed'`, `error=<msg>`.

Env vars the function reads (Supabase functions secrets):
`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`.

### 5.2 Per-doc-type prompt templates

`packages/api/supabase/functions/extract-document/prompts/`:

- `sa_id_smart_card.md`: instructs Claude to return
  `{full_name, id_number, date_of_birth, gender, nationality, citizenship_status, card_number, issue_date}` each with `confidence`.
- `sa_id_green_book.md`: similar.
- `proof_of_address.md`: `{document_type_detected, full_name, physical_address, issuer, issue_date}`.
- `bank_statement.md`: `{account_holder_name, account_number, bank_name, statement_period_start, statement_period_end, closing_balance}` plus
  `monthly_income_estimate` if detectable.

Every prompt ends with an explicit "return ONLY valid JSON, no prose" instruction.

### 5.3 Bot integration

Update `packages/bot/src/agent/tool-handlers.ts`:

- `handle_trigger_extraction(document_id)`:
  1. Insert `extraction_tasks` row.
  2. Invoke the edge function via HTTP
     (`${SUPABASE_URL}/functions/v1/extract-document`, Bearer `SUPABASE_SERVICE_ROLE_KEY`).
  3. Return the task id + initial status to the agent.
- `handle_get_extraction_results(document_id)`:
  - Read current `extraction_results` for the document.
  - If `extraction_tasks.status = 'processing'`, return "still processing" so
    the agent can decide to poll or wait.

### 5.4 Human review UI in web

(Phase 3 does the generic data binding; here you deliver ONE focused
sub-page that reviewers can open.)

`packages/web/src/pages/ExtractionReview.tsx`:
- Route `/deals/:id/extraction/:documentId`.
- Shows document preview (image or PDF) side-by-side with extracted fields.
- For each field: extracted_value, confidence bar, "verify" / "override"
  controls. Override writes `customer_confirmed_value` + sets
  `verification_status='OVERRIDDEN'`.
- "All verified" button marks every field `VERIFIED` in one request.

### 5.5 Golden fixture tests

Create `packages/api/tests/test-extraction.ts` (Deno):
- Synthetic doc fixtures in `packages/api/tests/fixtures/extraction/` (generated placeholder images + expected output JSON). It's fine if the actual Claude call is mocked for tests — the suite should primarily verify the wiring, schema, and confidence-threshold logic.
- Tests:
  - Inserting a document + triggering extraction creates an `extraction_tasks` row.
  - Low-confidence result creates a `Q_MISMATCH_REVIEW` task.
  - Oversized doc is rejected.
  - `get_extraction_results` returns structured fields.

### 5.6 Storage path support

Check if `documents` has a `storage_path` column. If not, add migration
`20260417020000_documents_storage_path.sql`:

```sql
ALTER TABLE documents ADD COLUMN IF NOT EXISTS storage_path text;
CREATE INDEX IF NOT EXISTS idx_documents_storage_path ON documents(storage_path);
```

Update bot document upload handlers to populate `storage_path`.

## Exit criteria

1. Edge function code present, compiles (Deno), has typed request/response.
2. Prompt files for at least 4 document types.
3. Bot `trigger_extraction` actually invokes the edge function (no placeholder).
4. Low-confidence results auto-create `Q_MISMATCH_REVIEW` tasks.
5. `ExtractionReview.tsx` renders fields with confidence UI.
6. `test-extraction.ts` suite passes locally (Claude call mocked is OK).
7. `PHASE_5_REPORT.md` with a pass/fail matrix per doc type and
   a cost-per-doc estimate.

## Process

1. Read this brief.
2. Read `packages/bot/src/agent/tool-handlers.ts` for existing placeholder + context.
3. Design edge function interface first; build it.
4. Wire bot integration.
5. Build review UI (can be a minimal page; Phase 3 will complete surrounding nav).
6. Write tests.
7. Commit + push + report.
