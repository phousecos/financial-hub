-- RLS Policies Update Script for Financial Hub
-- Run this in Supabase SQL Editor to secure all tables
-- This replaces the permissive "allow all" policies with authenticated-user-only policies

-- ============================================
-- COMPANIES TABLE
-- ============================================

-- Drop existing permissive policies
DROP POLICY IF EXISTS "Allow all inserts to companies" ON companies;
DROP POLICY IF EXISTS "Allow all reads to companies" ON companies;
DROP POLICY IF EXISTS "Allow all updates to companies" ON companies;
DROP POLICY IF EXISTS "Allow all deletes to companies" ON companies;
DROP POLICY IF EXISTS "Enable insert for all users" ON companies;
DROP POLICY IF EXISTS "Enable read access for all users" ON companies;
DROP POLICY IF EXISTS "Enable update for all users" ON companies;
DROP POLICY IF EXISTS "Enable delete for all users" ON companies;

-- Create authenticated-only policies
CREATE POLICY "Authenticated users can insert companies"
  ON companies FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can view companies"
  ON companies FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can update companies"
  ON companies FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can delete companies"
  ON companies FOR DELETE
  TO authenticated
  USING (true);

-- ============================================
-- BANK_ACCOUNTS TABLE
-- ============================================

DROP POLICY IF EXISTS "Allow all inserts to bank_accounts" ON bank_accounts;
DROP POLICY IF EXISTS "Allow all reads to bank_accounts" ON bank_accounts;
DROP POLICY IF EXISTS "Allow all updates to bank_accounts" ON bank_accounts;
DROP POLICY IF EXISTS "Allow all deletes to bank_accounts" ON bank_accounts;
DROP POLICY IF EXISTS "Enable insert for all users" ON bank_accounts;
DROP POLICY IF EXISTS "Enable read access for all users" ON bank_accounts;
DROP POLICY IF EXISTS "Enable update for all users" ON bank_accounts;
DROP POLICY IF EXISTS "Enable delete for all users" ON bank_accounts;

CREATE POLICY "Authenticated users can insert bank_accounts"
  ON bank_accounts FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can view bank_accounts"
  ON bank_accounts FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can update bank_accounts"
  ON bank_accounts FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can delete bank_accounts"
  ON bank_accounts FOR DELETE
  TO authenticated
  USING (true);

-- ============================================
-- RECEIPTS TABLE
-- ============================================

DROP POLICY IF EXISTS "Allow all inserts to receipts" ON receipts;
DROP POLICY IF EXISTS "Allow all reads to receipts" ON receipts;
DROP POLICY IF EXISTS "Allow all updates to receipts" ON receipts;
DROP POLICY IF EXISTS "Allow all deletes to receipts" ON receipts;
DROP POLICY IF EXISTS "Enable insert for all users" ON receipts;
DROP POLICY IF EXISTS "Enable read access for all users" ON receipts;
DROP POLICY IF EXISTS "Enable update for all users" ON receipts;
DROP POLICY IF EXISTS "Enable delete for all users" ON receipts;

CREATE POLICY "Authenticated users can insert receipts"
  ON receipts FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can view receipts"
  ON receipts FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can update receipts"
  ON receipts FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can delete receipts"
  ON receipts FOR DELETE
  TO authenticated
  USING (true);

-- ============================================
-- TRANSACTIONS TABLE
-- ============================================

DROP POLICY IF EXISTS "Allow all inserts to transactions" ON transactions;
DROP POLICY IF EXISTS "Allow all reads to transactions" ON transactions;
DROP POLICY IF EXISTS "Allow all updates to transactions" ON transactions;
DROP POLICY IF EXISTS "Allow all deletes to transactions" ON transactions;
DROP POLICY IF EXISTS "Enable insert for all users" ON transactions;
DROP POLICY IF EXISTS "Enable read access for all users" ON transactions;
DROP POLICY IF EXISTS "Enable update for all users" ON transactions;
DROP POLICY IF EXISTS "Enable delete for all users" ON transactions;

CREATE POLICY "Authenticated users can insert transactions"
  ON transactions FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can view transactions"
  ON transactions FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can update transactions"
  ON transactions FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can delete transactions"
  ON transactions FOR DELETE
  TO authenticated
  USING (true);

-- ============================================
-- TRANSACTION_RECEIPTS TABLE (Join table)
-- ============================================

DROP POLICY IF EXISTS "Allow all inserts to transaction_receipts" ON transaction_receipts;
DROP POLICY IF EXISTS "Allow all reads to transaction_receipts" ON transaction_receipts;
DROP POLICY IF EXISTS "Allow all updates to transaction_receipts" ON transaction_receipts;
DROP POLICY IF EXISTS "Allow all deletes to transaction_receipts" ON transaction_receipts;
DROP POLICY IF EXISTS "Enable insert for all users" ON transaction_receipts;
DROP POLICY IF EXISTS "Enable read access for all users" ON transaction_receipts;
DROP POLICY IF EXISTS "Enable update for all users" ON transaction_receipts;
DROP POLICY IF EXISTS "Enable delete for all users" ON transaction_receipts;

CREATE POLICY "Authenticated users can insert transaction_receipts"
  ON transaction_receipts FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can view transaction_receipts"
  ON transaction_receipts FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can update transaction_receipts"
  ON transaction_receipts FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can delete transaction_receipts"
  ON transaction_receipts FOR DELETE
  TO authenticated
  USING (true);

-- ============================================
-- SYNC_LOG TABLE
-- ============================================

DROP POLICY IF EXISTS "Allow all inserts to sync_log" ON sync_log;
DROP POLICY IF EXISTS "Allow all reads to sync_log" ON sync_log;
DROP POLICY IF EXISTS "Allow all updates to sync_log" ON sync_log;
DROP POLICY IF EXISTS "Allow all deletes to sync_log" ON sync_log;
DROP POLICY IF EXISTS "Enable insert for all users" ON sync_log;
DROP POLICY IF EXISTS "Enable read access for all users" ON sync_log;
DROP POLICY IF EXISTS "Enable update for all users" ON sync_log;
DROP POLICY IF EXISTS "Enable delete for all users" ON sync_log;

CREATE POLICY "Authenticated users can insert sync_log"
  ON sync_log FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can view sync_log"
  ON sync_log FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can update sync_log"
  ON sync_log FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can delete sync_log"
  ON sync_log FOR DELETE
  TO authenticated
  USING (true);

-- ============================================
-- SERVICE ROLE ACCESS FOR BACKGROUND PROCESSORS
-- ============================================
-- The Drive processor uses the service role key,
-- which bypasses RLS entirely. This is intentional for automated processing.
--
-- For additional security, you can:
-- 1. Create separate "service" policies that check for specific API keys
-- 2. Use a service_role key only for the background processors
-- 3. Keep the anon key for browser clients (which requires authentication)

-- ============================================
-- STORAGE BUCKET POLICIES
-- ============================================
-- Note: Storage policies are managed separately in the Supabase Dashboard
-- Go to Storage > receipts bucket > Policies
--
-- Recommended storage policies:
--
-- For SELECT (download):
-- CREATE POLICY "Authenticated users can view receipts"
-- ON storage.objects FOR SELECT
-- TO authenticated
-- USING (bucket_id = 'receipts');
--
-- For INSERT (upload):
-- CREATE POLICY "Authenticated users can upload receipts"
-- ON storage.objects FOR INSERT
-- TO authenticated
-- WITH CHECK (bucket_id = 'receipts');
--
-- For UPDATE:
-- CREATE POLICY "Authenticated users can update receipts"
-- ON storage.objects FOR UPDATE
-- TO authenticated
-- USING (bucket_id = 'receipts');
--
-- For DELETE:
-- CREATE POLICY "Authenticated users can delete receipts"
-- ON storage.objects FOR DELETE
-- TO authenticated
-- USING (bucket_id = 'receipts');

-- ============================================
-- VERIFICATION
-- ============================================
-- After running this script, verify policies with:
-- SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual
-- FROM pg_policies
-- WHERE schemaname = 'public';
