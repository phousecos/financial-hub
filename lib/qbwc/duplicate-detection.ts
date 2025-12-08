// lib/qbwc/duplicate-detection.ts - Duplicate Detection and Conflict Resolution

import type { QBDuplicateCheckResult, QBTxnType } from '../qbxml/types';
import type { Transaction } from '../types';

/**
 * Configuration for duplicate detection
 */
export interface DuplicateDetectionConfig {
  // Amount tolerance (percentage)
  amountTolerancePercent: number;
  // Date tolerance (days)
  dateTolerance: number;
  // Minimum confidence score to consider a duplicate
  minConfidence: number;
  // Whether to match on payee/vendor name
  matchPayee: boolean;
  // Whether to match on reference number
  matchReference: boolean;
}

// Default configuration
export const DEFAULT_DETECTION_CONFIG: DuplicateDetectionConfig = {
  amountTolerancePercent: 0.01, // 1% tolerance for rounding
  dateTolerance: 3, // 3 days tolerance
  minConfidence: 80, // 80% confidence to flag as duplicate
  matchPayee: true,
  matchReference: true,
};

/**
 * Calculate similarity score between two strings (0-100)
 */
function stringSimilarity(str1: string | null | undefined, str2: string | null | undefined): number {
  if (!str1 || !str2) return 0;

  const s1 = str1.toLowerCase().trim();
  const s2 = str2.toLowerCase().trim();

  if (s1 === s2) return 100;

  // Check if one contains the other
  if (s1.includes(s2) || s2.includes(s1)) return 85;

  // Levenshtein distance-based similarity
  const maxLen = Math.max(s1.length, s2.length);
  if (maxLen === 0) return 100;

  const distance = levenshteinDistance(s1, s2);
  return Math.max(0, Math.round((1 - distance / maxLen) * 100));
}

/**
 * Calculate Levenshtein distance between two strings
 */
function levenshteinDistance(str1: string, str2: string): number {
  const m = str1.length;
  const n = str2.length;

  // Create distance matrix
  const d: number[][] = Array(m + 1)
    .fill(null)
    .map(() => Array(n + 1).fill(0));

  // Initialize first column and row
  for (let i = 0; i <= m; i++) d[i][0] = i;
  for (let j = 0; j <= n; j++) d[0][j] = j;

  // Fill in the rest
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
      d[i][j] = Math.min(
        d[i - 1][j] + 1, // Deletion
        d[i][j - 1] + 1, // Insertion
        d[i - 1][j - 1] + cost // Substitution
      );
    }
  }

  return d[m][n];
}

/**
 * Calculate days between two dates
 */
function daysBetween(date1: Date | string, date2: Date | string): number {
  const d1 = typeof date1 === 'string' ? new Date(date1) : date1;
  const d2 = typeof date2 === 'string' ? new Date(date2) : date2;
  const diffTime = Math.abs(d2.getTime() - d1.getTime());
  return Math.floor(diffTime / (1000 * 60 * 60 * 24));
}

/**
 * Check if a QB transaction might be a duplicate of an existing transaction
 */
export function checkForDuplicate(
  qbTransaction: {
    txnID: string;
    txnType: QBTxnType;
    amount: number;
    txnDate: string;
    payee?: string;
    refNumber?: string;
    memo?: string;
  },
  existingTransactions: Transaction[],
  config: DuplicateDetectionConfig = DEFAULT_DETECTION_CONFIG
): QBDuplicateCheckResult {
  let bestMatch: Transaction | null = null;
  let bestConfidence = 0;
  const reasons: string[] = [];

  for (const existing of existingTransactions) {
    let confidence = 0;
    const matchReasons: string[] = [];

    // Check if already linked to this QB transaction
    if (existing.qb_txn_id === qbTransaction.txnID) {
      return {
        isDuplicate: true,
        matchedQBTxnID: existing.qb_txn_id,
        matchedQBTxnType: existing.qb_txn_type as QBTxnType,
        confidence: 100,
        reason: 'Already linked to this QB transaction',
      };
    }

    // Amount matching (40 points max)
    const amountDiff = Math.abs(existing.amount - qbTransaction.amount);
    const amountTolerance = Math.abs(qbTransaction.amount) * config.amountTolerancePercent;

    if (amountDiff === 0) {
      confidence += 40;
      matchReasons.push('Exact amount match');
    } else if (amountDiff <= amountTolerance) {
      confidence += 35;
      matchReasons.push('Amount within tolerance');
    } else if (amountDiff <= amountTolerance * 2) {
      confidence += 20;
      matchReasons.push('Amount close');
    }

    // Date matching (30 points max)
    const dateDiff = daysBetween(existing.transaction_date, qbTransaction.txnDate);

    if (dateDiff === 0) {
      confidence += 30;
      matchReasons.push('Same date');
    } else if (dateDiff <= config.dateTolerance) {
      confidence += 25 - dateDiff * 3;
      matchReasons.push(`Date within ${dateDiff} day(s)`);
    } else if (dateDiff <= config.dateTolerance * 2) {
      confidence += 10;
      matchReasons.push('Date somewhat close');
    }

    // Reference number matching (20 points max)
    if (config.matchReference && qbTransaction.refNumber && existing.external_ref) {
      const refSimilarity = stringSimilarity(existing.external_ref, qbTransaction.refNumber);
      if (refSimilarity >= 90) {
        confidence += 20;
        matchReasons.push('Reference number match');
      } else if (refSimilarity >= 70) {
        confidence += 10;
        matchReasons.push('Reference number similar');
      }
    }

    // Payee/Vendor matching (10 points max)
    if (config.matchPayee && qbTransaction.payee && existing.payee) {
      const payeeSimilarity = stringSimilarity(existing.payee, qbTransaction.payee);
      if (payeeSimilarity >= 80) {
        confidence += 10;
        matchReasons.push('Payee match');
      } else if (payeeSimilarity >= 50) {
        confidence += 5;
        matchReasons.push('Payee similar');
      }
    }

    // Description/Memo bonus (bonus points)
    if (qbTransaction.memo && existing.description) {
      const descSimilarity = stringSimilarity(existing.description, qbTransaction.memo);
      if (descSimilarity >= 70) {
        confidence += 5;
        matchReasons.push('Description similar');
      }
    }

    // Update best match
    if (confidence > bestConfidence) {
      bestConfidence = confidence;
      bestMatch = existing;
      reasons.length = 0;
      reasons.push(...matchReasons);
    }
  }

  // Determine if this is a duplicate
  const isDuplicate = bestConfidence >= config.minConfidence;

  return {
    isDuplicate,
    matchedQBTxnID: bestMatch?.qb_txn_id || undefined,
    matchedQBTxnType: bestMatch?.qb_txn_type as QBTxnType | undefined,
    confidence: bestConfidence,
    reason: isDuplicate
      ? `Likely duplicate (${bestConfidence}% confidence): ${reasons.join(', ')}`
      : bestConfidence > 0
      ? `Possible match (${bestConfidence}% confidence): ${reasons.join(', ')}`
      : 'No similar transactions found',
  };
}

/**
 * Conflict resolution strategies
 */
export type ConflictResolution = 'skip' | 'update' | 'create_new' | 'ask_user';

/**
 * Determine conflict resolution based on confidence and settings
 */
export function determineResolution(
  duplicateResult: QBDuplicateCheckResult,
  settings: {
    autoSkipThreshold: number; // Skip if confidence above this
    autoUpdateThreshold: number; // Update existing if confidence between this and skip
    alwaysAskAbove: number; // Always ask user if confidence above this
  } = {
    autoSkipThreshold: 95,
    autoUpdateThreshold: 80,
    alwaysAskAbove: 70,
  }
): ConflictResolution {
  if (!duplicateResult.isDuplicate) {
    return 'create_new';
  }

  const { confidence } = duplicateResult;

  if (confidence >= settings.autoSkipThreshold) {
    // Very high confidence - skip (already have this transaction)
    return 'skip';
  }

  if (confidence >= settings.autoUpdateThreshold) {
    // High confidence - update existing transaction with QB data
    return 'update';
  }

  if (confidence >= settings.alwaysAskAbove) {
    // Medium confidence - ask user
    return 'ask_user';
  }

  // Low confidence - create new
  return 'create_new';
}

/**
 * Batch check for duplicates
 */
export function batchCheckDuplicates(
  qbTransactions: Array<{
    txnID: string;
    txnType: QBTxnType;
    amount: number;
    txnDate: string;
    payee?: string;
    refNumber?: string;
    memo?: string;
  }>,
  existingTransactions: Transaction[],
  config: DuplicateDetectionConfig = DEFAULT_DETECTION_CONFIG
): Map<string, QBDuplicateCheckResult> {
  const results = new Map<string, QBDuplicateCheckResult>();

  for (const qbTxn of qbTransactions) {
    results.set(qbTxn.txnID, checkForDuplicate(qbTxn, existingTransactions, config));
  }

  return results;
}

/**
 * Get summary of duplicate check results
 */
export function getDuplicateSummary(results: Map<string, QBDuplicateCheckResult>): {
  total: number;
  duplicates: number;
  possibleDuplicates: number;
  newTransactions: number;
} {
  let duplicates = 0;
  let possibleDuplicates = 0;
  let newTransactions = 0;

  results.forEach((result) => {
    if (result.isDuplicate) {
      duplicates++;
    } else if (result.confidence >= 50) {
      possibleDuplicates++;
    } else {
      newTransactions++;
    }
  });

  return {
    total: results.size,
    duplicates,
    possibleDuplicates,
    newTransactions,
  };
}
