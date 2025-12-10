// app/api/sync/trigger/route.ts - Trigger QB Sync Operations

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { queueOperations } from '@/lib/qbwc/db-session-manager';
import type { QBOperationType } from '@/lib/qbxml/types';

// Create service client for background operations
const supabaseService = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

// Valid sync types that can be triggered
const VALID_SYNC_TYPES = [
  'full', // All data (pull)
  'vendors',
  'customers',
  'accounts',
  'checks',
  'bills',
  'credit_cards',
  'transactions', // checks + bills + credit_cards (pull)
  'push_transactions', // Push local transactions to QB
  'push_with_receipts', // Push transactions with receipt data to memo
] as const;

type SyncType = (typeof VALID_SYNC_TYPES)[number];

/**
 * Get operations for a sync type (pull operations only)
 */
function getOperationsForSyncType(
  syncType: SyncType,
  options?: {
    fromDate?: string;
    toDate?: string;
    modifiedSince?: string;
  }
): Array<{ type: QBOperationType; data?: Record<string, unknown> }> {
  const operations: Array<{ type: QBOperationType; data?: Record<string, unknown> }> = [];

  const dateFilter = {
    fromTxnDate: options?.fromDate,
    toTxnDate: options?.toDate,
    fromModifiedDate: options?.modifiedSince,
  };

  switch (syncType) {
    case 'full':
      operations.push(
        { type: 'query_vendors', data: { activeStatus: 'All' } },
        { type: 'query_customers', data: { activeStatus: 'All' } },
        { type: 'query_accounts', data: { activeStatus: 'All' } },
        { type: 'query_checks', data: { ...dateFilter, includeLineItems: true } },
        { type: 'query_bills', data: { ...dateFilter, includeLineItems: true } },
        { type: 'query_credit_cards', data: { ...dateFilter, includeLineItems: true } }
      );
      break;

    case 'vendors':
      operations.push({ type: 'query_vendors', data: { activeStatus: 'All', ...dateFilter } });
      break;

    case 'customers':
      operations.push({ type: 'query_customers', data: { activeStatus: 'All', ...dateFilter } });
      break;

    case 'accounts':
      operations.push({ type: 'query_accounts', data: { activeStatus: 'All' } });
      break;

    case 'checks':
      operations.push({ type: 'query_checks', data: { ...dateFilter, includeLineItems: true } });
      break;

    case 'bills':
      operations.push({ type: 'query_bills', data: { ...dateFilter, includeLineItems: true } });
      break;

    case 'credit_cards':
      operations.push({ type: 'query_credit_cards', data: { ...dateFilter, includeLineItems: true } });
      break;

    case 'transactions':
      operations.push(
        { type: 'query_checks', data: { ...dateFilter, includeLineItems: true } },
        { type: 'query_bills', data: { ...dateFilter, includeLineItems: true } },
        { type: 'query_credit_cards', data: { ...dateFilter, includeLineItems: true } }
      );
      break;

    // Push operations are handled separately in getPushOperations
    case 'push_transactions':
    case 'push_with_receipts':
      // These are handled by getPushOperations which returns async data
      break;
  }

  return operations;
}

/**
 * Build receipt memo string for a transaction
 */
function buildReceiptMemo(
  transaction: { description?: string; payee?: string },
  receipts: Array<{ id: string; vendor?: string; description?: string; file_url?: string }>
): string {
  const parts: string[] = [];

  // Original transaction description
  if (transaction.description) {
    parts.push(transaction.description);
  }

  // Receipt information
  if (receipts.length > 0) {
    parts.push('');
    parts.push('--- Receipts ---');
    receipts.forEach((receipt, index) => {
      const receiptParts: string[] = [];
      if (receipt.vendor) receiptParts.push(receipt.vendor);
      if (receipt.description) receiptParts.push(receipt.description);
      parts.push(`[${index + 1}] ${receiptParts.join(' - ')}`);
    });
  }

  // Truncate to QB memo limit (4095 characters)
  const memo = parts.join('\n');
  return memo.length > 4095 ? memo.substring(0, 4092) + '...' : memo;
}

/**
 * Get push operations for transactions that need to be synced to QB
 */
async function getPushOperations(
  companyId: string,
  includeReceipts: boolean,
  syncConfig: { defaultExpenseAccount?: string; defaultCreditCardAccount?: string }
): Promise<Array<{ type: QBOperationType; data: Record<string, unknown> }>> {
  const operations: Array<{ type: QBOperationType; data: Record<string, unknown> }> = [];

  // Query transactions that need to be pushed to QB
  const { data: transactions, error } = await supabaseService
    .from('transactions')
    .select(`
      id,
      company_id,
      amount,
      transaction_date,
      payee,
      description,
      external_ref,
      source,
      qb_txn_type,
      transaction_receipts (
        receipt:receipts (
          id,
          vendor,
          description,
          file_url
        )
      )
    `)
    .eq('company_id', companyId)
    .eq('needs_qb_push', true)
    .is('qb_txn_id', null)
    .order('transaction_date', { ascending: true });

  if (error) {
    console.error('[Sync Trigger] Error fetching transactions to push:', error);
    return operations;
  }

  if (!transactions || transactions.length === 0) {
    console.log('[Sync Trigger] No transactions to push for company:', companyId);
    return operations;
  }

  console.log('[Sync Trigger] Found', transactions.length, 'transactions to push');

  for (const txn of transactions) {
    // Build memo with receipt info if requested
    let memo = txn.description || '';
    if (includeReceipts && txn.transaction_receipts && txn.transaction_receipts.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const receipts = txn.transaction_receipts
        .map((tr: any) => tr.receipt)
        .filter((r: any) => r !== null);
      memo = buildReceiptMemo(txn, receipts);
    }

    // Determine transaction type and build appropriate operation
    // Default to credit card charge for Amex imports, check for others
    const txnType = txn.qb_txn_type || (txn.source === 'amex_csv' ? 'CreditCardCharge' : 'Check');

    if (txnType === 'CreditCardCharge') {
      operations.push({
        type: 'add_credit_card_charge',
        data: {
          transactionId: txn.id, // Store for later DB update
          accountFullName: syncConfig.defaultCreditCardAccount || 'American Express',
          payeeFullName: txn.payee || undefined,
          txnDate: txn.transaction_date,
          refNumber: txn.external_ref || undefined,
          memo: memo || undefined,
          expenseLines: syncConfig.defaultExpenseAccount ? [{
            accountRef: { fullName: syncConfig.defaultExpenseAccount, listID: '' },
            amount: Math.abs(txn.amount),
          }] : undefined,
        },
      });
    } else if (txnType === 'Bill') {
      operations.push({
        type: 'add_bill',
        data: {
          transactionId: txn.id,
          vendorFullName: txn.payee || 'Unknown Vendor',
          txnDate: txn.transaction_date,
          refNumber: txn.external_ref || undefined,
          memo: memo || undefined,
          expenseLines: syncConfig.defaultExpenseAccount ? [{
            accountRef: { fullName: syncConfig.defaultExpenseAccount, listID: '' },
            amount: Math.abs(txn.amount),
          }] : undefined,
        },
      });
    } else {
      // Default to Check
      operations.push({
        type: 'add_check',
        data: {
          transactionId: txn.id,
          accountFullName: 'Checking', // Should be configurable
          payeeFullName: txn.payee || undefined,
          txnDate: txn.transaction_date,
          refNumber: txn.external_ref || undefined,
          memo: memo || undefined,
          isToBePrinted: false,
          expenseLines: syncConfig.defaultExpenseAccount ? [{
            accountRef: { fullName: syncConfig.defaultExpenseAccount, listID: '' },
            amount: Math.abs(txn.amount),
          }] : undefined,
        },
      });
    }
  }

  return operations;
}

/**
 * POST /api/sync/trigger - Queue sync operations
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // Authenticate user
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookies) {
            cookies.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          },
        },
      }
    );

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse request body
    const body = await request.json();
    const { companyId, syncType, fromDate, toDate, modifiedSince } = body;

    // Validate company ID
    if (!companyId) {
      return NextResponse.json({ error: 'Company ID is required' }, { status: 400 });
    }

    // Validate sync type
    if (!syncType || !VALID_SYNC_TYPES.includes(syncType)) {
      return NextResponse.json(
        {
          error: `Invalid sync type. Must be one of: ${VALID_SYNC_TYPES.join(', ')}`,
        },
        { status: 400 }
      );
    }

    // Verify company exists and user has access
    const { data: company, error: companyError } = await supabase
      .from('companies')
      .select('id, name, qb_file_path')
      .eq('id', companyId)
      .single();

    if (companyError || !company) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    }

    // Determine if this is a push or pull operation
    const isPushOperation = syncType === 'push_transactions' || syncType === 'push_with_receipts';
    const direction = isPushOperation ? 'to_qb' : 'from_qb';

    let operations: Array<{ type: QBOperationType; data?: Record<string, unknown> }>;

    if (isPushOperation) {
      // Get sync config for the company
      const { data: syncConfig } = await supabase
        .from('sync_config')
        .select('default_expense_account, default_credit_card_account')
        .eq('company_id', companyId)
        .single();

      // Get push operations from database
      operations = await getPushOperations(
        companyId,
        syncType === 'push_with_receipts',
        {
          defaultExpenseAccount: syncConfig?.default_expense_account || undefined,
          defaultCreditCardAccount: syncConfig?.default_credit_card_account || undefined,
        }
      );
    } else {
      // Get pull operations based on sync type
      operations = getOperationsForSyncType(syncType, {
        fromDate,
        toDate,
        modifiedSince,
      });
    }

    if (operations.length === 0) {
      return NextResponse.json({
        success: true,
        message: isPushOperation
          ? 'No transactions need to be pushed to QuickBooks'
          : 'No operations to perform',
        operations: [],
      });
    }

    // Queue the operations in the database
    const queuedOps = await queueOperations(companyId, operations);

    // Log the sync trigger
    await supabase.from('sync_log').insert({
      company_id: companyId,
      sync_type: syncType,
      direction,
      status: 'pending',
      records_processed: 0,
      records_failed: 0,
      started_at: new Date().toISOString(),
      created_by: user.id,
    });

    return NextResponse.json({
      success: true,
      message: `Queued ${queuedOps.length} operations for ${isPushOperation ? 'push to' : 'pull from'} QuickBooks`,
      operations: queuedOps.map((op) => ({
        id: op.id,
        type: op.type,
      })),
      note: 'Operations will be processed when QB Web Connector connects',
    });
  } catch (error) {
    console.error('[Sync Trigger] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
