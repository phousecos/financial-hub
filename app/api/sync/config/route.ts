// app/api/sync/config/route.ts - QB Sync Configuration

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * GET /api/sync/config - Get sync configuration for a company
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

    // Get company with QB settings
    const { data: company, error: companyError } = await supabase
      .from('companies')
      .select('id, name, code, qb_file_path, qb_list_id, active')
      .eq('id', companyId)
      .single();

    if (companyError || !company) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    }

    // Get bank accounts for this company (for QB account mapping)
    const { data: bankAccounts } = await supabase
      .from('bank_accounts')
      .select('id, account_name, account_type, last_four, qb_account_ref')
      .eq('company_id', companyId);

    return NextResponse.json({
      company: {
        id: company.id,
        name: company.name,
        code: company.code,
        qbFilePath: company.qb_file_path,
        qbListId: company.qb_list_id,
        active: company.active,
      },
      bankAccounts: bankAccounts?.map((ba) => ({
        id: ba.id,
        accountName: ba.account_name,
        accountType: ba.account_type,
        lastFour: ba.last_four,
        qbAccountRef: ba.qb_account_ref,
      })),
      // Sync settings (could be stored in a separate table)
      syncSettings: {
        autoSyncEnabled: false, // Future: automatic sync scheduling
        syncInterval: 'manual', // manual, hourly, daily
        lastFullSync: null,
        defaultExpenseAccount: null,
        defaultAPAccount: null,
        defaultCreditCardAccount: null,
      },
    });
  } catch (error) {
    console.error('[Sync Config] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/sync/config - Update sync configuration
 */
export async function PUT(request: NextRequest): Promise<NextResponse> {
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

    const body = await request.json();
    const { companyId, qbFilePath, qbListId } = body;

    if (!companyId) {
      return NextResponse.json({ error: 'Company ID is required' }, { status: 400 });
    }

    // Update company QB settings
    const { data: company, error: updateError } = await supabase
      .from('companies')
      .update({
        qb_file_path: qbFilePath || null,
        qb_list_id: qbListId || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', companyId)
      .select()
      .single();

    if (updateError) {
      console.error('[Sync Config] Update error:', updateError);
      return NextResponse.json({ error: 'Failed to update configuration' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      company: {
        id: company.id,
        name: company.name,
        qbFilePath: company.qb_file_path,
        qbListId: company.qb_list_id,
      },
    });
  } catch (error) {
    console.error('[Sync Config] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
