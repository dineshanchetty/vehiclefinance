-- Migration: 20260417020000_documents_storage_path
-- Adds storage_path column to documents table (idempotent via IF NOT EXISTS / DO block)
-- Phase 5 — extract-document edge function reads this column to download from Supabase Storage.

DO $$
BEGIN
  -- Add storage_path column if it does not already exist
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'documents'
      AND column_name  = 'storage_path'
  ) THEN
    ALTER TABLE public.documents
      ADD COLUMN storage_path text;

    COMMENT ON COLUMN public.documents.storage_path IS
      'Path within the deal-documents Supabase Storage bucket, e.g. documents/<deal_id>/buyer/id_document_<ts>.jpg';
  END IF;

  -- Add extracted_at timestamp column if it does not already exist
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'documents'
      AND column_name  = 'extracted_at'
  ) THEN
    ALTER TABLE public.documents
      ADD COLUMN extracted_at timestamptz;

    COMMENT ON COLUMN public.documents.extracted_at IS
      'Timestamp when AI extraction completed for this document.';
  END IF;

  -- Add error_message column if it does not already exist
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'documents'
      AND column_name  = 'error_message'
  ) THEN
    ALTER TABLE public.documents
      ADD COLUMN error_message text;

    COMMENT ON COLUMN public.documents.error_message IS
      'Last error message from extraction pipeline, if status = failed.';
  END IF;
END $$;

-- Index to speed up extraction pipeline queries by storage path
CREATE INDEX IF NOT EXISTS idx_documents_storage_path
  ON public.documents (storage_path)
  WHERE storage_path IS NOT NULL;

-- Also add low_confidence_fields + flagged to extraction_results if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'extraction_results'
      AND column_name  = 'low_confidence_fields'
  ) THEN
    ALTER TABLE public.extraction_results
      ADD COLUMN low_confidence_fields text[] DEFAULT '{}';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'extraction_results'
      AND column_name  = 'flagged'
  ) THEN
    ALTER TABLE public.extraction_results
      ADD COLUMN flagged boolean NOT NULL DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'extraction_results'
      AND column_name  = 'model_used'
  ) THEN
    ALTER TABLE public.extraction_results
      ADD COLUMN model_used text;
  END IF;
END $$;
