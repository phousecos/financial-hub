// app/api/transactions/no-receipt/route.ts - Mark transaction as not needing a receipt
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface NoReceiptRequest {
  transaction_id: string;
  no_receipt_needed: boolean;
}

export async function POST(request: Request) {
  try {
    const body: NoReceiptRequest = await request.json();
    const { transaction_id, no_receipt_needed } = body;

    // Validation
    if (!transaction_id) {
      return NextResponse.json({ error: 'transaction_id is required' }, { status: 400 });
    }

    if (typeof no_receipt_needed !== 'boolean') {
      return NextResponse.json({ error: 'no_receipt_needed must be a boolean' }, { status: 400 });
    }

    // Verify transaction exists
    const { data: transaction, error: txnError } = await supabase
      .from('transactions')
      .select('id, receipt_matched')
      .eq('id', transaction_id)
      .single();

    if (txnError || !transaction) {
      return NextResponse.json({ error: 'Transaction not found' }, { status: 404 });
    }

    // Don't allow marking as no receipt if already matched to a receipt
    if (transaction.receipt_matched && no_receipt_needed) {
      return NextResponse.json(
        { error: 'Cannot mark as no receipt needed - transaction already has a receipt matched' },
        { status: 400 }
      );
    }

    // Update transaction
    const { error: updateError } = await supabase
      .from('transactions')
      .update({
        no_receipt_needed,
        updated_at: new Date().toISOString(),
      })
      .eq('id', transaction_id);

    if (updateError) {
      console.error('Error updating transaction:', updateError);
      return NextResponse.json({ error: 'Failed to update transaction' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: no_receipt_needed
        ? 'Transaction marked as no receipt needed'
        : 'Transaction unmarked as no receipt needed',
    });
  } catch (error) {
    console.error('No receipt update error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
