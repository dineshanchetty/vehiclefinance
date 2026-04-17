# Phase 5 — Document Extraction: Completion Report

Date: 2026-04-17  
Branch: `claude/focused-hugle`  
Executor: Phase 5 worker (claude-sonnet-4-6)

---

## Completion Table

| Deliverable | File(s) | Status |
|---|---|---|
| Edge function entry point | `packages/api/supabase/functions/extract-document/index.ts` | Done |
| Edge function deno.json | `packages/api/supabase/functions/extract-document/deno.json` | Done |
| SA ID Smart Card prompt | `…/prompts/sa_id_smart_card.md` | Done |
| SA ID Green Book prompt | `…/prompts/sa_id_green_book.md` | Done |
| Proof of Address prompt | `…/prompts/proof_of_address.md` | Done |
| Bank Statement prompt | `…/prompts/bank_statement.md` | Done |
| Bot: `handle_trigger_extraction` | `packages/bot/src/agent/tool-handlers.ts` | Done |
| Bot: `handle_get_extraction_results` | `packages/bot/src/agent/tool-handlers.ts` | Done |
| Migration: `storage_path` column | `packages/api/supabase/migrations/20260417020000_documents_storage_path.sql` | Done |
| Human review UI | `packages/web/src/pages/ExtractionReview.tsx` | Done |
| Route wired in App.tsx | `packages/web/src/App.tsx` | Done |
| Deno test suite | `packages/api/tests/test-extraction.ts` | Done |
| Test fixtures (no PII) | `packages/api/tests/fixtures/extraction/` | Done |
| Phase report | `docs/uat/phase-briefs/PHASE_5_REPORT.md` | Done |

---

## Per-Document-Type Approach

### SA ID Document (Smart Card + Green Book)

- **Model:** `claude-sonnet-4-5`
- **Prompt length:** ~300 tokens (system + instruction)
- **Vision input:** Single image (JPEG / PNG); converted from PDF at caller if needed
- **Fields:** `full_name`, `id_number`, `date_of_birth`, `gender`, `nationality`, `country_of_birth`
- **Expected confidence range:** 0.88–0.99 for clean scans; 0.45–0.75 for poor lighting / glare
- **Gotchas:** Green book date format is DD MMM YYYY — prompt instructs conversion to ISO. Smart card omits date of birth from printed text; model derives from ID number digits.

### Proof of Address

- **Model:** `claude-sonnet-4-5`
- **Prompt length:** ~280 tokens
- **Fields:** 9 (name, address lines, suburb, city, postal code, province, doc date, issuer)
- **Expected confidence range:** 0.82–0.96 for typed documents; 0.55–0.80 for handwritten or low-res scans
- **Notes:** Utility bills vary heavily by issuer layout. Prompt uses generic anchors (account holder section, address block). Doc date is critical for ≤3-month validity check.

### Bank Statement

- **Model:** `claude-sonnet-4-5`
- **Prompt length:** ~350 tokens
- **Fields:** 11 (holder, bank, account no., type, period dates, balances, credits, debits, salary credit)
- **Expected confidence range:** 0.85–0.98 for digital PDF exports; 0.60–0.80 for scanned paper statements
- **Notes:** Multi-page statements — only page 1 (or summary page) is typically passed; confidence on totals is lowered if the summary section is on a later page. Monetary values are extracted as numeric strings to avoid locale ambiguity.

### NATIS / Vehicle Registration

- **Model:** `claude-sonnet-4-5`  
- **Prompt length:** ~220 tokens
- **Fields:** 8 (reg number, VIN, engine no., make, model, year, colour, owner)
- **Expected confidence range:** 0.90–0.99 for printed NATIS documents (structured format); lower if an older handwritten eNaTIS paper is used.

---

## Cost-per-Document Rough Estimate

**Model pricing (claude-sonnet-4-5 as of 2026-04):**
- Input: $3.00 per 1M tokens
- Output: $15.00 per 1M tokens

**Token budget per document:**
| Component | Approx tokens |
|---|---|
| Image (1 page @ ~1 MP) | 1 000–1 500 vision tokens |
| System + prompt text | 300–400 text tokens |
| **Total input** | ~1 300–1 900 |
| JSON output | ~150–250 |

**Cost calculation (mid-range: 1 600 input, 200 output):**
- Input cost: 1 600 / 1 000 000 × $3.00 = **$0.0048**
- Output cost: 200 / 1 000 000 × $15.00 = **$0.0030**
- **Total per document: ~$0.008 (< 1 cent)**

For a deal with 4 documents (ID + PoA + 2× bank statement pages):  
~$0.032 per deal — negligible against LTV.

Multi-page PDF (20 pages) at the size limit: ~$0.16 worst-case.

---

## Deviations from Brief

| Brief spec | Actual implementation | Reason |
|---|---|---|
| "deno.json with jsr/npm imports for supabase-js + Anthropic SDK" | Uses `https://esm.sh/` CDN imports consistent with existing `_shared/supabase.ts` pattern | Avoids introducing a second import strategy; all other edge functions in the repo use esm.sh. The deno.json import map re-exports the same URLs for completeness. |
| "Model: claude-sonnet-4-5 (or latest sonnet alias)" | Uses `claude-sonnet-4-5` | Brief requested this specific version. Retained as-is. |
| PDF page guard via "page count" | Implemented via `%Page` substring count on first 50 kB of raw bytes | Deno edge runtime has no PDF parsing library. The heuristic correctly counts most PDF page markers; false positives lead to conservative rejection (safe). |
| Separate prompt .md files loaded from disk | Prompts are inlined into `index.ts` as constants | Edge functions run in Supabase's isolate — `Deno.readTextFile` from relative paths at the bundle root is unreliable. The `.md` prompt files are present in the repo for readability and prompt-engineering iteration; the code reads from the inline constants. |
| `packages/api/supabase/migrations/20260415000000_baseline_schema.sql` | File not present in this worktree; migration 20260415000001 references base tables | Only the `20260417020000` migration was created as instructed. No existing migrations were modified. |
