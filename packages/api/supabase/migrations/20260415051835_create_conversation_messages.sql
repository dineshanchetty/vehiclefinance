-- Migration: create_conversation_messages
-- Pulled from live project sahvfsoclzgsuewbiiah on 2026-04-17
-- Creates the per-phone conversation log used by the bot's Claude agent.

CREATE TABLE IF NOT EXISTS conversation_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text NOT NULL,
  deal_id uuid REFERENCES deals(id),
  party_type text,
  role text NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content text,
  tool_use jsonb,
  tool_result jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_conv_messages_phone ON conversation_messages(phone, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_conv_messages_deal ON conversation_messages(deal_id);

ALTER TABLE conversation_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all" ON conversation_messages FOR ALL TO service_role USING (true);
