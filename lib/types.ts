// lib/types.ts - Database types

export interface Company {
  id: string;
  name: string;
  code: string | null;
  qb_file_path: string | null;
  qb_list_id: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface BankAccount {
  id: string;
  company_id: string;
  account_name: string;
  account_type: string | null;
  last_four: string | null;
  qb_account_ref: string | null;
  auto_import: boolean;
  last_import_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface Receipt {
  id: string;
  company_id: string;
  amount: number | null;
  transaction_date: string | null;
  description: string | null;
  vendor: string | null;
  file_url: string | null;
  file_name: string | null;
  file_type: string | null;
  email_subject: string | null;
  email_from: string | null;
  email_received_at: string | null;
  matched: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Transaction {
  id: string;
  company_id: string;
  bank_account_id: string | null;
  amount: number;
  transaction_date: string;
  posted_date: string | null;
  payee: string | null;
  description: string | null;
  category: string | null;
  external_ref: string | null;
  qb_txn_id: string | null;
  qb_txn_type: string | null;
  source: 'bank_feed' | 'amex_import' | 'qb_pull' | 'manual';
  status: 'unmatched' | 'matched' | 'synced_to_qb';
  needs_qb_push: boolean;
  receipt_matched: boolean;
  no_receipt_needed: boolean;
  memo: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

export interface TransactionReceipt {
  id: string;
  transaction_id: string;
  receipt_id: string;
  split_amount: number | null;
  matched_by: string | null;
  matched_at: string;
  notes: string | null;
}

export interface SyncLog {
  id: string;
  company_id: string;
  sync_type: string;
  direction: 'from_qb' | 'to_qb';
  status: 'success' | 'error' | 'partial';
  records_processed: number;
  records_failed: number;
  error_message: string | null;
  qbxml_request: string | null;
  qbxml_response: string | null;
  started_at: string;
  completed_at: string | null;
  created_by: string | null;
}

export interface UserRole {
  id: string;
  user_id: string;
  role: 'admin' | 'bookkeeper' | 'viewer';
  company_id: string | null;
  created_at: string;
}

// Helper types for joins
export interface ReceiptWithCompany extends Receipt {
  company: Company;
}

export interface TransactionWithDetails extends Transaction {
  company: Company;
  bank_account: BankAccount | null;
  receipts?: Receipt[];
}

export interface TransactionMatch {
  transaction: Transaction;
  receipt: Receipt;
  confidence: number; // 0-100
  reason: string; // Why they match
}

// Amex CSV row type
export interface AmexCSVRow {
  Date: string;
  Description: string;
  Status: string;
  Currency: string;
  Amount: string;
  'Ending Balance': string;
  Reference: string;
}

// Email parsing result
export interface ParsedReceiptEmail {
  companyName: string;
  amount: number;
  description: string;
  attachments: {
    filename: string;
    contentType: string;
    data: Buffer;
  }[];
}
