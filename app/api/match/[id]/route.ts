// app/api/match/[id]/route.ts - Delete a match (unmatch)
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET - Get match details
export async function GET(request: Request, { params }: RouteParams) {
  const { id } = await params;

  try {
    const { data: match, error } = await supabase
      .from('transaction_receipts')
      .select(`
        *,
        receipt:receipts(*),
        transaction:transactions(*)
      `)
      .eq('id', id)
      .single();

    if (error || !match) {
      return NextResponse.json({ error: 'Match not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, match });
  } catch (error) {
    console.error('Get match error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// DELETE - Remove a match
export async function DELETE(request: Request, { params }: RouteParams) {
  const { id } = await params;

  try {
    // Get the match first to know what to update
    const { data: match, error: fetchError } = await supabase
      .from('transaction_receipts')
      .select('receipt_id, transaction_id')
      .eq('id', id)
      .single();

    if (fetchError || !match) {
      return NextResponse.json({ error: 'Match not found' }, { status: 404 });
    }

    const { receipt_id, transaction_id } = match;

    // Delete the match
    const { error: deleteError } = await supabase
      .from('transaction_receipts')
      .delete()
      .eq('id', id);

    if (deleteError) {
      console.error('Error deleting match:', deleteError);
      return NextResponse.json({ error: 'Failed to delete match' }, { status: 500 });
    }

    // Check if receipt has any other matches
    const { data: otherReceiptMatches } = await supabase
      .from('transaction_receipts')
      .select('id')
      .eq('receipt_id', receipt_id);

    // If no other matches, mark receipt as unmatched
    if (!otherReceiptMatches || otherReceiptMatches.length === 0) {
      await supabase
        .from('receipts')
        .update({ matched: false, updated_at: new Date().toISOString() })
        .eq('id', receipt_id);
    }

    // Check if transaction has any other matches
    const { data: otherTxnMatches } = await supabase
      .from('transaction_receipts')
      .select('id')
      .eq('transaction_id', transaction_id);

    // If no other matches, mark transaction as unmatched
    if (!otherTxnMatches || otherTxnMatches.length === 0) {
      await supabase
        .from('transactions')
        .update({ receipt_matched: false, updated_at: new Date().toISOString() })
        .eq('id', transaction_id);
    }

    return NextResponse.json({
      success: true,
      message: 'Match removed successfully',
      receipt_id,
      transaction_id,
    });
  } catch (error) {
    console.error('Delete match error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
