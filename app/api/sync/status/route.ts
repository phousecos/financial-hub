// app/api/sync/status/route.ts - Get Sync Status

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import {
  getAllSessions,
  getPendingOperationCount,
  hasPendingOperations,
} from '@/lib/qbwc/session-manager';

/**
 * GET /api/sync/status - Get sync status for a company
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
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

    // Get company ID from query params
    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get('companyId');

    if (!companyId) {
      return NextResponse.json({ error: 'Company ID is required' }, { status: 400 });
    }

    // Get pending operations count
    const pendingCount = getPendingOperationCount(companyId);
    const hasPending = hasPendingOperations(companyId);

    // Get active sessions for this company
    const allSessions = getAllSessions();
    const companySessions = allSessions.filter((s) => s.companyId === companyId);
    const activeSession = companySessions.find((s) => s.status === 'in_progress');

    // Get recent sync logs from database
    const { data: recentLogs, error: logsError } = await supabase
      .from('sync_log')
      .select('*')
      .eq('company_id', companyId)
      .order('started_at', { ascending: false })
      .limit(10);

    if (logsError) {
      console.error('[Sync Status] Error fetching logs:', logsError);
    }

    // Get last successful sync time
    const { data: lastSync } = await supabase
      .from('sync_log')
      .select('completed_at, sync_type')
      .eq('company_id', companyId)
      .eq('status', 'success')
      .not('completed_at', 'is', null)
      .order('completed_at', { ascending: false })
      .limit(1)
      .single();

    // Get transaction counts by source
    const { data: transactionStats } = await supabase
      .from('transactions')
      .select('source')
      .eq('company_id', companyId);

    const sourceCounts = {
      qb_pull: 0,
      amex_import: 0,
      bank_feed: 0,
      manual: 0,
    };

    transactionStats?.forEach((t) => {
      if (t.source in sourceCounts) {
        sourceCounts[t.source as keyof typeof sourceCounts]++;
      }
    });

    return NextResponse.json({
      companyId,
      status: activeSession ? 'syncing' : hasPending ? 'pending' : 'idle',
      pendingOperations: pendingCount,
      activeSession: activeSession
        ? {
            id: activeSession.id,
            currentStep: activeSession.currentStep,
            totalSteps: activeSession.totalSteps,
            progress: activeSession.totalSteps > 0
              ? Math.round((activeSession.currentStep / activeSession.totalSteps) * 100)
              : 0,
          }
        : null,
      lastSync: lastSync
        ? {
            completedAt: lastSync.completed_at,
            syncType: lastSync.sync_type,
          }
        : null,
      recentLogs: recentLogs?.map((log) => ({
        id: log.id,
        syncType: log.sync_type,
        direction: log.direction,
        status: log.status,
        recordsProcessed: log.records_processed,
        recordsFailed: log.records_failed,
        errorMessage: log.error_message,
        startedAt: log.started_at,
        completedAt: log.completed_at,
      })),
      transactionCounts: sourceCounts,
    });
  } catch (error) {
    console.error('[Sync Status] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
