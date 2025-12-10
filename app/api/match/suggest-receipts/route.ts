// app/api/match/suggest-receipts/route.ts - Suggest receipts for a transaction
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface ReceiptSuggestion {
  receipt_id: string;
  confidence: number;
  reasons: string[];
  receipt: {
    id: string;
    amount: number | null;
    transaction_date: string | null;
    description: string | null;
    vendor: string | null;
    file_url: string | null;
    file_type: string | null;
  };
}

// Calculate confidence score and reasons for a match
function calculateMatchScore(
  transaction: { amount: number; transaction_date: string; description: string | null; payee: string | null },
  receipt: { amount: number | null; transaction_date: string | null; vendor: string | null; description: string | null }
): { confidence: number; reasons: string[] } {
  let confidence = 0;
  const reasons: string[] = [];

  // Amount matching (max 50 points)
  if (receipt.amount !== null) {
    const receiptAmount = Math.abs(receipt.amount);
    const txnAmount = Math.abs(transaction.amount);
    const amountDiff = Math.abs(receiptAmount - txnAmount);

    if (amountDiff === 0) {
      confidence += 50;
      reasons.push('Exact amount match');
    } else if (amountDiff <= 0.01) {
      confidence += 48;
      reasons.push('Amount match (penny difference)');
    } else if (amountDiff <= 1) {
      confidence += 40;
      reasons.push(`Amount within $1 (diff: $${amountDiff.toFixed(2)})`);
    } else if (amountDiff <= 5) {
      confidence += 30;
      reasons.push(`Amount within $5 (diff: $${amountDiff.toFixed(2)})`);
    } else if (amountDiff <= 10) {
      confidence += 15;
      reasons.push(`Amount within $10 (diff: $${amountDiff.toFixed(2)})`);
    }
  }

  // Date matching (max 30 points)
  if (receipt.transaction_date) {
    const receiptDate = new Date(receipt.transaction_date);
    const txnDate = new Date(transaction.transaction_date);
    const daysDiff = Math.abs(Math.floor((receiptDate.getTime() - txnDate.getTime()) / (1000 * 60 * 60 * 24)));

    if (daysDiff === 0) {
      confidence += 30;
      reasons.push('Same date');
    } else if (daysDiff <= 1) {
      confidence += 25;
      reasons.push('Date within 1 day');
    } else if (daysDiff <= 3) {
      confidence += 20;
      reasons.push(`Date within 3 days (${daysDiff} days apart)`);
    } else if (daysDiff <= 7) {
      confidence += 10;
      reasons.push(`Date within 1 week (${daysDiff} days apart)`);
    } else if (daysDiff <= 14) {
      confidence += 5;
      reasons.push(`Date within 2 weeks (${daysDiff} days apart)`);
    }
  }

  // Vendor/payee text matching (max 20 points)
  if (receipt.vendor && (transaction.description || transaction.payee)) {
    const vendorLower = receipt.vendor.toLowerCase();
    const descLower = (transaction.description || '').toLowerCase();
    const payeeLower = (transaction.payee || '').toLowerCase();

    // Check for exact or partial matches
    if (descLower.includes(vendorLower) || payeeLower.includes(vendorLower)) {
      confidence += 20;
      reasons.push('Vendor name found in transaction');
    } else if (vendorLower.includes(descLower) || vendorLower.includes(payeeLower)) {
      confidence += 15;
      reasons.push('Transaction name found in vendor');
    } else {
      // Check for partial word matches
      const vendorWords = vendorLower.split(/\s+/).filter(w => w.length > 2);
      const txnWords = `${descLower} ${payeeLower}`.split(/\s+/).filter(w => w.length > 2);

      const matchingWords = vendorWords.filter(vw =>
        txnWords.some(tw => tw.includes(vw) || vw.includes(tw))
      );

      if (matchingWords.length > 0) {
        confidence += Math.min(10, matchingWords.length * 5);
        reasons.push(`Partial vendor match: "${matchingWords.join(', ')}"`);
      }
    }
  }

  return { confidence, reasons };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const transactionId = searchParams.get('transaction_id');
  const minConfidence = parseInt(searchParams.get('min_confidence') || '20');

  if (!transactionId) {
    return NextResponse.json(
      { error: 'transaction_id is required' },
      { status: 400 }
    );
  }

  try {
    // Get the transaction
    const { data: transaction, error: txnError } = await supabase
      .from('transactions')
      .select('id, company_id, amount, transaction_date, description, payee, receipt_matched, no_receipt_needed')
      .eq('id', transactionId)
      .single();

    if (txnError || !transaction) {
      return NextResponse.json(
        { error: 'Transaction not found' },
        { status: 404 }
      );
    }

    if (transaction.receipt_matched) {
      return NextResponse.json(
        { error: 'Transaction already has a receipt matched' },
        { status: 400 }
      );
    }

    // Get unmatched receipts for the same company
    const { data: receipts, error: receiptError } = await supabase
      .from('receipts')
      .select('id, amount, transaction_date, description, vendor, file_url, file_type')
      .eq('company_id', transaction.company_id)
      .eq('matched', false);

    if (receiptError) throw receiptError;

    // Score each receipt
    const scored: ReceiptSuggestion[] = [];

    for (const receipt of receipts || []) {
      const { confidence, reasons } = calculateMatchScore(transaction, receipt);

      if (confidence >= minConfidence) {
        scored.push({
          receipt_id: receipt.id,
          confidence,
          reasons,
          receipt,
        });
      }
    }

    // Sort by confidence descending
    scored.sort((a, b) => b.confidence - a.confidence);

    return NextResponse.json({
      success: true,
      suggestions: scored.slice(0, 10), // Top 10 suggestions
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Receipt suggestion error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
