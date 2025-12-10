// lib/qbwc/db-session-manager.ts - Database-backed QB Web Connector Session Management
// Uses Supabase for persistence across serverless function invocations

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { QBOperationType } from '../qbxml/types';

// Create Supabase client with service role for background processing
function getSupabase(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );
}

interface DBOperation {
  id: string;
  company_id: string;
  session_ticket: string | null;
  operation_type: string;
  operation_data: Record<string, unknown> | null;
  status: string;
  request_xml: string | null;
  response_xml: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

/**
 * Generate a unique session ticket
 */
function generateTicket(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 15);
  return `qbwc-${timestamp}-${random}`;
}

/**
 * Queue an operation for a company
 */
export async function queueOperation(
  companyId: string,
  type: QBOperationType,
  data?: Record<string, unknown>
): Promise<{ id: string; type: QBOperationType }> {
  const supabase = getSupabase();

  const { data: op, error } = await supabase
    .from('sync_operations')
    .insert({
      company_id: companyId,
      operation_type: type,
      operation_data: data || null,
      status: 'pending',
    })
    .select('id')
    .single();

  if (error) {
    console.error('[QBWC-DB] Error queuing operation:', error);
    throw error;
  }

  console.log('[QBWC-DB] Queued operation:', type, 'for company:', companyId);
  return { id: op.id, type };
}

/**
 * Queue multiple operations for a company
 */
export async function queueOperations(
  companyId: string,
  operations: Array<{ type: QBOperationType; data?: Record<string, unknown> }>
): Promise<Array<{ id: string; type: QBOperationType }>> {
  const supabase = getSupabase();

  const records = operations.map(op => ({
    company_id: companyId,
    operation_type: op.type,
    operation_data: op.data || null,
    status: 'pending',
  }));

  const { data: ops, error } = await supabase
    .from('sync_operations')
    .insert(records)
    .select('id, operation_type');

  if (error) {
    console.error('[QBWC-DB] Error queuing operations:', error);
    throw error;
  }

  console.log('[QBWC-DB] Queued', ops.length, 'operations for company:', companyId);
  return ops.map(op => ({ id: op.id, type: op.operation_type as QBOperationType }));
}

/**
 * Check if company has pending operations
 */
export async function hasPendingOperations(companyId: string): Promise<boolean> {
  const supabase = getSupabase();

  const { count, error } = await supabase
    .from('sync_operations')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .eq('status', 'pending')
    .is('session_ticket', null);

  if (error) {
    console.error('[QBWC-DB] Error checking pending operations:', error);
    return false;
  }

  return (count || 0) > 0;
}

/**
 * Get pending operation count for company
 */
export async function getPendingOperationCount(companyId: string): Promise<number> {
  const supabase = getSupabase();

  const { count, error } = await supabase
    .from('sync_operations')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .eq('status', 'pending')
    .is('session_ticket', null);

  if (error) {
    console.error('[QBWC-DB] Error counting operations:', error);
    return 0;
  }

  return count || 0;
}

/**
 * Create a session by assigning pending operations to a ticket
 */
export async function createSession(companyId: string): Promise<{
  ticket: string;
  operationCount: number;
}> {
  const supabase = getSupabase();
  const ticket = generateTicket();

  // Assign all pending operations for this company to this session
  const { data: ops, error } = await supabase
    .from('sync_operations')
    .update({
      session_ticket: ticket,
      updated_at: new Date().toISOString(),
    })
    .eq('company_id', companyId)
    .eq('status', 'pending')
    .is('session_ticket', null)
    .select('id');

  if (error) {
    console.error('[QBWC-DB] Error creating session:', error);
    throw error;
  }

  const count = ops?.length || 0;
  console.log('[QBWC-DB] Created session:', ticket, 'with', count, 'operations');

  return { ticket, operationCount: count };
}

/**
 * Get the current (next pending) operation for a session
 */
export async function getCurrentOperation(ticket: string): Promise<{
  id: string;
  type: QBOperationType;
  data: Record<string, unknown> | null;
} | null> {
  const supabase = getSupabase();

  const { data: op, error } = await supabase
    .from('sync_operations')
    .select('id, operation_type, operation_data')
    .eq('session_ticket', ticket)
    .in('status', ['pending', 'sent'])
    .order('created_at', { ascending: true })
    .limit(1)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      // No rows found
      return null;
    }
    console.error('[QBWC-DB] Error getting current operation:', error);
    return null;
  }

  return {
    id: op.id,
    type: op.operation_type as QBOperationType,
    data: op.operation_data,
  };
}

/**
 * Get the operation that was sent (waiting for response)
 */
export async function getSentOperation(ticket: string): Promise<{
  id: string;
  type: QBOperationType;
  data: Record<string, unknown> | null;
} | null> {
  const supabase = getSupabase();

  const { data: op, error } = await supabase
    .from('sync_operations')
    .select('id, operation_type, operation_data')
    .eq('session_ticket', ticket)
    .eq('status', 'sent')
    .order('created_at', { ascending: true })
    .limit(1)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      // No rows found
      return null;
    }
    console.error('[QBWC-DB] Error getting sent operation:', error);
    return null;
  }

  return {
    id: op.id,
    type: op.operation_type as QBOperationType,
    data: op.operation_data,
  };
}

/**
 * Mark an operation as sent (QBXML sent to QB)
 */
export async function markOperationSent(
  operationId: string,
  requestXml: string
): Promise<void> {
  const supabase = getSupabase();

  const { error } = await supabase
    .from('sync_operations')
    .update({
      status: 'sent',
      request_xml: requestXml,
      updated_at: new Date().toISOString(),
    })
    .eq('id', operationId);

  if (error) {
    console.error('[QBWC-DB] Error marking operation sent:', error);
    throw error;
  }
}

/**
 * Complete an operation with response
 */
export async function completeOperation(
  operationId: string,
  response: string,
  error?: string
): Promise<void> {
  const supabase = getSupabase();

  const { error: dbError } = await supabase
    .from('sync_operations')
    .update({
      status: error ? 'error' : 'completed',
      response_xml: response,
      error_message: error || null,
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', operationId);

  if (dbError) {
    console.error('[QBWC-DB] Error completing operation:', dbError);
    throw dbError;
  }
}

/**
 * Get session progress
 */
export async function getSessionProgress(ticket: string): Promise<{
  total: number;
  completed: number;
  percentComplete: number;
  hasMore: boolean;
}> {
  const supabase = getSupabase();

  const { data: ops, error } = await supabase
    .from('sync_operations')
    .select('status')
    .eq('session_ticket', ticket);

  if (error || !ops) {
    return { total: 0, completed: 0, percentComplete: 100, hasMore: false };
  }

  const total = ops.length;
  const completed = ops.filter(op => op.status === 'completed' || op.status === 'error').length;
  const percentComplete = total > 0 ? Math.round((completed / total) * 100) : 100;
  const hasMore = completed < total;

  return { total, completed, percentComplete, hasMore };
}

/**
 * Close a session (mark remaining operations as cancelled)
 */
export async function closeSession(ticket: string): Promise<void> {
  const supabase = getSupabase();

  // Get final progress for logging
  const progress = await getSessionProgress(ticket);
  console.log('[QBWC-DB] Closing session:', ticket, '- completed', progress.completed, '/', progress.total);

  // Don't delete - keep for audit trail
  // Just log that session is closed
}

/**
 * Clear all pending operations for a company (cancel them)
 */
export async function clearOperations(companyId: string): Promise<number> {
  const supabase = getSupabase();

  const { data: ops, error } = await supabase
    .from('sync_operations')
    .delete()
    .eq('company_id', companyId)
    .eq('status', 'pending')
    .is('session_ticket', null)
    .select('id');

  if (error) {
    console.error('[QBWC-DB] Error clearing operations:', error);
    return 0;
  }

  return ops?.length || 0;
}

/**
 * Get company ID from session ticket
 */
export async function getCompanyIdFromTicket(ticket: string): Promise<string | null> {
  const supabase = getSupabase();

  const { data: op, error } = await supabase
    .from('sync_operations')
    .select('company_id')
    .eq('session_ticket', ticket)
    .limit(1)
    .single();

  if (error) {
    return null;
  }

  return op?.company_id || null;
}
