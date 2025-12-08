// lib/qbxml/types.ts - QuickBooks XML Types

// QB Web Connector session info
export interface QBSession {
  id: string;
  companyId: string;
  ticket: string;
  status: 'pending' | 'in_progress' | 'completed' | 'error';
  currentStep: number;
  totalSteps: number;
  operations: QBOperation[];
  createdAt: Date;
  updatedAt: Date;
}

// Individual sync operation
export interface QBOperation {
  id: string;
  type: QBOperationType;
  status: 'pending' | 'sent' | 'completed' | 'error';
  request?: string;
  response?: string;
  errorMessage?: string;
  data?: Record<string, unknown>;
}

export type QBOperationType =
  | 'query_vendors'
  | 'query_customers'
  | 'query_accounts'
  | 'query_items'
  | 'query_checks'
  | 'query_bills'
  | 'query_credit_cards'
  | 'query_journal_entries'
  | 'add_check'
  | 'add_bill'
  | 'add_credit_card_charge'
  | 'add_journal_entry'
  | 'mod_check'
  | 'mod_bill';

// QB Transaction types we care about
export type QBTxnType =
  | 'Check'
  | 'Bill'
  | 'CreditCardCharge'
  | 'CreditCardCredit'
  | 'JournalEntry'
  | 'Deposit'
  | 'Transfer';

// Vendor from QB
export interface QBVendor {
  listID: string;
  name: string;
  isActive: boolean;
  companyName?: string;
  phone?: string;
  email?: string;
  balance?: number;
}

// Customer from QB
export interface QBCustomer {
  listID: string;
  name: string;
  fullName: string;
  isActive: boolean;
  companyName?: string;
  balance?: number;
}

// Account from QB
export interface QBAccount {
  listID: string;
  name: string;
  fullName: string;
  accountType: string;
  accountNumber?: string;
  balance?: number;
  isActive: boolean;
}

// Item (for line items) from QB
export interface QBItem {
  listID: string;
  name: string;
  fullName: string;
  itemType: string;
  isActive: boolean;
  description?: string;
  price?: number;
  accountRef?: string;
}

// Check transaction from QB
export interface QBCheck {
  txnID: string;
  txnNumber?: string;
  txnDate: string;
  amount: number;
  accountRef: {
    listID: string;
    fullName: string;
  };
  payeeRef?: {
    listID: string;
    fullName: string;
  };
  memo?: string;
  refNumber?: string;
  expenseLines: QBExpenseLine[];
  itemLines: QBItemLine[];
  isToBePrinted?: boolean;
  editSequence: string;
}

// Bill from QB
export interface QBBill {
  txnID: string;
  txnNumber?: string;
  txnDate: string;
  dueDate?: string;
  amount: number;
  amountDue?: number;
  vendorRef: {
    listID: string;
    fullName: string;
  };
  apAccountRef?: {
    listID: string;
    fullName: string;
  };
  memo?: string;
  refNumber?: string;
  expenseLines: QBExpenseLine[];
  itemLines: QBItemLine[];
  isPaid?: boolean;
  editSequence: string;
}

// Credit Card Charge from QB
export interface QBCreditCardCharge {
  txnID: string;
  txnDate: string;
  amount: number;
  accountRef: {
    listID: string;
    fullName: string;
  };
  payeeRef?: {
    listID: string;
    fullName: string;
  };
  memo?: string;
  refNumber?: string;
  expenseLines: QBExpenseLine[];
  itemLines: QBItemLine[];
  editSequence: string;
}

// Expense line item
export interface QBExpenseLine {
  accountRef: {
    listID: string;
    fullName: string;
  };
  amount: number;
  memo?: string;
  customerRef?: {
    listID: string;
    fullName: string;
  };
  classRef?: {
    listID: string;
    fullName: string;
  };
  billableStatus?: 'Billable' | 'NotBillable' | 'HasBeenBilled';
}

// Item line (for inventory/service items)
export interface QBItemLine {
  itemRef: {
    listID: string;
    fullName: string;
  };
  quantity?: number;
  unitOfMeasure?: string;
  rate?: number;
  amount: number;
  description?: string;
  customerRef?: {
    listID: string;
    fullName: string;
  };
  classRef?: {
    listID: string;
    fullName: string;
  };
}

// Web Connector callback types
export interface QBWCAuthenticateResult {
  ticket: string;
  status: 'nvu' | '' | 'none' | string; // nvu=invalid user, empty=has work, none=no work, companyFile path
}

export interface QBWCSendRequestXMLResult {
  qbxml: string;
}

export interface QBWCReceiveResponseXMLResult {
  percentComplete: number;
}

// Sync configuration per company
export interface QBSyncConfig {
  companyId: string;
  enabled: boolean;
  qbFilePath: string;
  syncVendors: boolean;
  syncCustomers: boolean;
  syncAccounts: boolean;
  defaultExpenseAccount?: string;
  defaultAPAccount?: string;
  defaultCreditCardAccount?: string;
  lastFullSync?: string;
  lastVendorSync?: string;
  lastTransactionSync?: string;
}

// Sync queue item for pending operations
export interface QBSyncQueueItem {
  id: string;
  companyId: string;
  operationType: QBOperationType;
  transactionId?: string;
  receiptId?: string;
  priority: number;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  attempts: number;
  maxAttempts: number;
  lastError?: string;
  qbxmlRequest?: string;
  qbxmlResponse?: string;
  createdAt: string;
  processedAt?: string;
}

// Duplicate detection result
export interface QBDuplicateCheckResult {
  isDuplicate: boolean;
  matchedQBTxnID?: string;
  matchedQBTxnType?: QBTxnType;
  confidence: number;
  reason: string;
}
