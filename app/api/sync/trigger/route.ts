// app/api/sync/trigger/route.ts - Trigger QB Sync Operations

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { queueOperations } from '@/lib/qbwc/session-manager';
import type { QBOperationType } from '@/lib/qbxml/types';

// Valid sync types that can be triggered
const VALID_SYNC_TYPES = [
  'full', // All data
  'vendors',
  'customers',
  'accounts',
  'checks',
  'bills',
  'credit_cards',
  'transactions', // checks + bills + credit_cards
] as const;

type SyncType = (typeof VALID_SYNC_TYPES)[number];

/**
 * Get operations for a sync type
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

    // Get operations for this sync type
    const operations = getOperationsForSyncType(syncType, {
      fromDate,
      toDate,
      modifiedSince,
    });

    if (operations.length === 0) {
      return NextResponse.json({ error: 'No operations to perform' }, { status: 400 });
    }

    // Queue the operations
    const queuedOps = queueOperations(companyId, operations);

    // Log the sync trigger
    await supabase.from('sync_log').insert({
      company_id: companyId,
      sync_type: syncType,
      direction: 'from_qb',
      status: 'success',
      records_processed: 0,
      records_failed: 0,
      started_at: new Date().toISOString(),
      created_by: user.id,
    });

    return NextResponse.json({
      success: true,
      message: `Queued ${queuedOps.length} operations for sync`,
      operations: queuedOps.map((op) => ({
        id: op.id,
        type: op.type,
        status: op.status,
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
