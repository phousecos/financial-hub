// lib/qbwc/session-manager.ts - QB Web Connector Session Management

import type { QBSession, QBOperation, QBOperationType } from '../qbxml/types';

// In-memory session store (in production, use Redis or database)
const sessions = new Map<string, QBSession>();

// Operation queue per company (in production, store in database)
const operationQueues = new Map<string, QBOperation[]>();

/**
 * Generate a unique session ticket
 */
function generateTicket(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 15);
  return `qbwc-${timestamp}-${random}`;
}

/**
 * Create a new session for a company
 */
export function createSession(companyId: string): QBSession {
  const ticket = generateTicket();
  const operations = operationQueues.get(companyId) || [];

  const session: QBSession = {
    id: crypto.randomUUID(),
    companyId,
    ticket,
    status: 'pending',
    currentStep: 0,
    totalSteps: operations.length,
    operations: [...operations], // Copy operations for this session
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  sessions.set(ticket, session);

  // Clear the queue for this company (operations are now assigned to session)
  operationQueues.delete(companyId);

  return session;
}

/**
 * Get session by ticket
 */
export function getSession(ticket: string): QBSession | undefined {
  return sessions.get(ticket);
}

/**
 * Update session
 */
export function updateSession(ticket: string, updates: Partial<QBSession>): QBSession | undefined {
  const session = sessions.get(ticket);
  if (!session) return undefined;

  const updated = {
    ...session,
    ...updates,
    updatedAt: new Date(),
  };

  sessions.set(ticket, updated);
  return updated;
}

/**
 * Close and clean up session
 */
export function closeSession(ticket: string): boolean {
  return sessions.delete(ticket);
}

/**
 * Get current operation for session
 */
export function getCurrentOperation(ticket: string): QBOperation | undefined {
  const session = sessions.get(ticket);
  if (!session) return undefined;

  return session.operations[session.currentStep];
}

/**
 * Mark current operation as sent and get next
 */
export function markOperationSent(ticket: string): QBOperation | undefined {
  const session = sessions.get(ticket);
  if (!session) return undefined;

  const currentOp = session.operations[session.currentStep];
  if (currentOp) {
    currentOp.status = 'sent';
  }

  sessions.set(ticket, { ...session, updatedAt: new Date() });
  return currentOp;
}

/**
 * Complete current operation and advance to next
 */
export function completeCurrentOperation(
  ticket: string,
  response: string,
  error?: string
): { percentComplete: number; hasMore: boolean } {
  const session = sessions.get(ticket);
  if (!session) return { percentComplete: 100, hasMore: false };

  const currentOp = session.operations[session.currentStep];
  if (currentOp) {
    currentOp.status = error ? 'error' : 'completed';
    currentOp.response = response;
    currentOp.errorMessage = error;
  }

  session.currentStep++;
  session.updatedAt = new Date();

  const hasMore = session.currentStep < session.operations.length;
  const percentComplete = hasMore
    ? Math.round((session.currentStep / session.operations.length) * 100)
    : 100;

  if (!hasMore) {
    session.status = 'completed';
  }

  sessions.set(ticket, session);

  return { percentComplete, hasMore };
}

/**
 * Queue an operation for a company
 */
export function queueOperation(
  companyId: string,
  type: QBOperationType,
  data?: Record<string, unknown>
): QBOperation {
  const operation: QBOperation = {
    id: crypto.randomUUID(),
    type,
    status: 'pending',
    data,
  };

  const queue = operationQueues.get(companyId) || [];
  queue.push(operation);
  operationQueues.set(companyId, queue);

  return operation;
}

/**
 * Queue multiple operations for a company
 */
export function queueOperations(
  companyId: string,
  operations: Array<{ type: QBOperationType; data?: Record<string, unknown> }>
): QBOperation[] {
  return operations.map((op) => queueOperation(companyId, op.type, op.data));
}

/**
 * Check if company has pending operations
 */
export function hasPendingOperations(companyId: string): boolean {
  const queue = operationQueues.get(companyId);
  return queue !== undefined && queue.length > 0;
}

/**
 * Get pending operation count for company
 */
export function getPendingOperationCount(companyId: string): number {
  const queue = operationQueues.get(companyId);
  return queue?.length || 0;
}

/**
 * Clear all pending operations for a company
 */
export function clearOperations(companyId: string): void {
  operationQueues.delete(companyId);
}

/**
 * Get all active sessions (for monitoring)
 */
export function getAllSessions(): QBSession[] {
  return Array.from(sessions.values());
}

/**
 * Clean up stale sessions (older than 1 hour)
 */
export function cleanupStaleSessions(): number {
  const staleThreshold = Date.now() - 60 * 60 * 1000; // 1 hour
  let cleaned = 0;

  sessions.forEach((session, ticket) => {
    if (session.createdAt.getTime() < staleThreshold) {
      sessions.delete(ticket);
      cleaned++;
    }
  });

  return cleaned;
}
