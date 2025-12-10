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

-- Policy: Users can view their company's mappings
CREATE POLICY "Users can view company mappings" ON source_account_mapping
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_companies uc
      WHERE uc.company_id = source_account_mapping.company_id
      AND uc.user_id = auth.uid()
    )
  );

-- Policy: Users can manage their company's mappings
CREATE POLICY "Users can manage company mappings" ON source_account_mapping
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_companies uc
      WHERE uc.company_id = source_account_mapping.company_id
      AND uc.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_companies uc
      WHERE uc.company_id = source_account_mapping.company_id
      AND uc.user_id = auth.uid()
    )
  );

-- Policy: Service role full access (for background processing)
CREATE POLICY "Service role full access" ON source_account_mapping
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Add comment
COMMENT ON TABLE source_account_mapping IS 'Maps import sources (amex_csv, live_oak, etc.) to QuickBooks account names for multi-account support';

-- Example data (commented out - run manually per company):
-- INSERT INTO source_account_mapping (company_id, source, qb_account_name, account_type, is_default)
-- VALUES
--   ('company-uuid-here', 'amex_csv', 'American Express', 'credit_card', true),
--   ('company-uuid-here', 'live_oak', 'Live Oak Bank Checking', 'bank', true);
