-- Migration: 20260423000000_drop_conversation_state
-- Drops the conversation_state table (created by 20260417010000) because the
-- rule-based flow layer it backed has been removed. The agent-based bot stores
-- turns in `conversation_messages` instead; no code reads or writes
-- `conversation_state` anymore.
--
-- Idempotent: safe to apply even if the table was already dropped or was never
-- applied in this environment.

DROP TABLE IF EXISTS public.conversation_state CASCADE;
