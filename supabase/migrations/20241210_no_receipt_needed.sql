-- Migration: Add no_receipt_needed column to transactions table
-- This allows marking transactions that don't require a receipt

ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS no_receipt_needed BOOLEAN NOT NULL DEFAULT false;

-- Index for finding transactions that need receipt attention
CREATE INDEX IF NOT EXISTS idx_transactions_receipt_status
  ON transactions(company_id, receipt_matched, no_receipt_needed)
  WHERE NOT receipt_matched AND NOT no_receipt_needed;

-- Add comment
COMMENT ON COLUMN transactions.no_receipt_needed IS 'Flag to indicate this transaction does not require a receipt';
