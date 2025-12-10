-- Migration: Create source_account_mapping table for mapping import sources to QB accounts
-- Supports multiple bank accounts per company with source-specific mapping

CREATE TABLE IF NOT EXISTS source_account_mapping (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  source TEXT NOT NULL, -- e.g., 'amex_csv', 'live_oak', 'manual', 'bank_import'
  qb_account_name TEXT NOT NULL, -- exact QuickBooks account name
  account_type TEXT NOT NULL DEFAULT 'credit_card', -- 'credit_card', 'bank', 'expense'
  is_default BOOLEAN NOT NULL DEFAULT false, -- true if this is the default for the account type
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Each company can only have one mapping per source
  CONSTRAINT unique_company_source UNIQUE (company_id, source)
);

-- Index for looking up account by company and source
CREATE INDEX IF NOT EXISTS idx_source_account_mapping_lookup
  ON source_account_mapping(company_id, source);

-- Index for finding default accounts
CREATE INDEX IF NOT EXISTS idx_source_account_mapping_default
  ON source_account_mapping(company_id, account_type, is_default)
  WHERE is_default = true;

-- Enable RLS
ALTER TABLE source_account_mapping ENABLE ROW LEVEL SECURITY;

-- Policy: Authenticated users can view mappings
CREATE POLICY "Authenticated users can view source_account_mapping"
  ON source_account_mapping FOR SELECT
  TO authenticated
  USING (true);

-- Policy: Authenticated users can insert mappings
CREATE POLICY "Authenticated users can insert source_account_mapping"
  ON source_account_mapping FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Policy: Authenticated users can update mappings
CREATE POLICY "Authenticated users can update source_account_mapping"
  ON source_account_mapping FOR UPDATE
  TO authenticated
  USING (true);

-- Policy: Authenticated users can delete mappings
CREATE POLICY "Authenticated users can delete source_account_mapping"
  ON source_account_mapping FOR DELETE
  TO authenticated
  USING (true);

-- Add comment
COMMENT ON TABLE source_account_mapping IS 'Maps import sources (amex_csv, live_oak, etc.) to QuickBooks account names for multi-account support';

-- Example data (commented out - run manually per company):
-- INSERT INTO source_account_mapping (company_id, source, qb_account_name, account_type, is_default)
-- VALUES
--   ('company-uuid-here', 'amex_csv', 'American Express', 'credit_card', true),
--   ('company-uuid-here', 'live_oak', 'Live Oak Bank Checking', 'bank', true);
