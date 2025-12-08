// app/api/match/create/route.ts - Create a match between receipt and transaction(s)
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface MatchRequest {
  receipt_id: string;
  transaction_ids: string[]; // Support matching one receipt to multiple transactions (splits)
  split_amounts?: Record<string, number>; // Optional: specify amount per transaction for splits
  notes?: string;
  matched_by?: string;
}

export async function POST(request: Request) {
  try {
    const body: MatchRequest = await request.json();
    const { receipt_id, transaction_ids, split_amounts, notes, matched_by } = body;

    // Validation
    if (!receipt_id) {
      return NextResponse.json({ error: 'receipt_id is required' }, { status: 400 });
    }

    if (!transaction_ids || transaction_ids.length === 0) {
      return NextResponse.json({ error: 'At least one transaction_id is required' }, { status: 400 });
    }

    // Verify receipt exists and is not already matched
    const { data: receipt, error: receiptError } = await supabase
      .from('receipts')
      .select('id, company_id, amount, matched')
      .eq('id', receipt_id)
      .single();

    if (receiptError || !receipt) {
      return NextResponse.json({ error: 'Receipt not found' }, { status: 404 });
    }

    if (receipt.matched) {
      return NextResponse.json({ error: 'Receipt is already matched' }, { status: 400 });
    }

    // Verify all transactions exist, belong to same company, and are not already matched
    const { data: transactions, error: txnError } = await supabase
      .from('transactions')
      .select('id, company_id, receipt_matched')
      .in('id', transaction_ids);

    if (txnError || !transactions) {
      return NextResponse.json({ error: 'Error fetching transactions' }, { status: 500 });
    }

    if (transactions.length !== transaction_ids.length) {
      return NextResponse.json({ error: 'One or more transactions not found' }, { status: 404 });
    }

    // Check all transactions belong to the same company as the receipt
    const wrongCompany = transactions.find(t => t.company_id !== receipt.company_id);
    if (wrongCompany) {
      return NextResponse.json(
        { error: 'All transactions must belong to the same company as the receipt' },
        { status: 400 }
      );
    }

    // Check none of the transactions are already matched
    const alreadyMatched = transactions.find(t => t.receipt_matched);
    if (alreadyMatched) {
      return NextResponse.json(
        { error: `Transaction ${alreadyMatched.id} is already matched to a receipt` },
        { status: 400 }
      );
    }

    // Check for existing matches in junction table
    const { data: existingMatches } = await supabase
      .from('transaction_receipts')
      .select('transaction_id')
      .in('transaction_id', transaction_ids);

    if (existingMatches && existingMatches.length > 0) {
      return NextResponse.json(
        { error: 'One or more transactions already have receipt matches' },
        { status: 400 }
      );
    }

    // Create the match records
    const matchRecords = transaction_ids.map(txn_id => ({
      receipt_id,
      transaction_id: txn_id,
      split_amount: split_amounts?.[txn_id] || null,
      matched_by: matched_by || null,
      matched_at: new Date().toISOString(),
      notes: notes || null,
    }));

    const { data: createdMatches, error: createError } = await supabase
      .from('transaction_receipts')
      .insert(matchRecords)
      .select();

    if (createError) {
      console.error('Error creating match:', createError);
      return NextResponse.json({ error: 'Failed to create match' }, { status: 500 });
    }

    // Update receipt as matched
    const { error: receiptUpdateError } = await supabase
      .from('receipts')
      .update({ matched: true, updated_at: new Date().toISOString() })
      .eq('id', receipt_id);

    if (receiptUpdateError) {
      console.error('Error updating receipt:', receiptUpdateError);
    }

    // Update transactions as matched
    const { error: txnUpdateError } = await supabase
      .from('transactions')
      .update({ receipt_matched: true, updated_at: new Date().toISOString() })
      .in('id', transaction_ids);

    if (txnUpdateError) {
      console.error('Error updating transactions:', txnUpdateError);
    }

    return NextResponse.json({
      success: true,
      matches: createdMatches,
      message: `Successfully matched receipt to ${transaction_ids.length} transaction(s)`,
    });
  } catch (error) {
    console.error('Match creation error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
