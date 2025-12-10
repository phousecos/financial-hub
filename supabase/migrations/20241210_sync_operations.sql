-- Migration: Create sync_operations table for QBWC operation queue
-- This replaces in-memory storage to work with serverless functions

CREATE TABLE IF NOT EXISTS sync_operations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  session_ticket TEXT, -- NULL until assigned to a session
  operation_type TEXT NOT NULL,
  operation_data JSONB,
  status TEXT NOT NULL DEFAULT 'pending', -- pending, sent, completed, error
  request_xml TEXT,
  response_xml TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- Index for finding pending operations by company
CREATE INDEX IF NOT EXISTS idx_sync_operations_company_pending
  ON sync_operations(company_id, status)
  WHERE status = 'pending';

-- Index for finding operations by session ticket
CREATE INDEX IF NOT EXISTS idx_sync_operations_ticket
  ON sync_operations(session_ticket)
  WHERE session_ticket IS NOT NULL;

-- Enable RLS
ALTER TABLE sync_operations ENABLE ROW LEVEL SECURITY;

-- Policy: Service role can do everything (for QBWC background processing)
CREATE POLICY "Service role full access" ON sync_operations
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Add comment
COMMENT ON TABLE sync_operations IS 'Queue for QBWC sync operations - persists across serverless invocations';
