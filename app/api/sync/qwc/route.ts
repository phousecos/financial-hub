// app/api/sync/qwc/route.ts - Generate QWC file for QB Web Connector

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * Generate a unique File ID (GUID format)
 */
function generateFileId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16).toUpperCase();
  });
}

/**
 * Generate QWC file content
 */
function generateQWCFile(options: {
  appName: string;
  appId: string;
  appUrl: string;
  appDescription: string;
  appSupport: string;
  userName: string;
  ownerId: string;
  fileId: string;
  qbType: 'QBFS' | 'QBPOS'; // QBFS = QuickBooks Financial Software
  scheduler?: {
    everyMinutes?: number;
  };
}): string {
  const {
    appName,
    appId,
    appUrl,
    appDescription,
    appSupport,
    userName,
    ownerId,
    fileId,
    qbType,
    scheduler,
  } = options;

  let schedulerXml = '';
  if (scheduler?.everyMinutes) {
    schedulerXml = `
  <Scheduler>
    <RunEveryNMinutes>${scheduler.everyMinutes}</RunEveryNMinutes>
  </Scheduler>`;
  }

  return `<?xml version="1.0"?>
<QBWCXML>
  <AppName>${appName}</AppName>
  <AppID>${appId}</AppID>
  <AppURL>${appUrl}</AppURL>
  <AppDescription>${appDescription}</AppDescription>
  <AppSupport>${appSupport}</AppSupport>
  <UserName>${userName}</UserName>
  <OwnerID>{${ownerId}}</OwnerID>
  <FileID>{${fileId}}</FileID>
  <QBType>${qbType}</QBType>
  <AuthFlags>0x2</AuthFlags>${schedulerXml}
</QBWCXML>`;
}

/**
 * GET /api/sync/qwc - Download QWC file
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

    // Get company
    const { data: company, error: companyError } = await supabase
      .from('companies')
      .select('id, name, code')
      .eq('id', companyId)
      .single();

    if (companyError || !company) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    }

    // Get base URL from environment or request
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;

    // Generate QWC file
    const qwcContent = generateQWCFile({
      appName: `Financial Hub - ${company.name}`,
      appId: 'FinancialHub',
      appUrl: `${baseUrl}/api/qbwc`,
      appDescription: `Sync transactions and receipts between Financial Hub and QuickBooks for ${company.name}`,
      appSupport: `${baseUrl}/support`,
      userName: process.env.QBWC_USERNAME || 'admin',
      ownerId: generateFileId(), // Unique owner ID
      fileId: generateFileId(), // Unique file ID
      qbType: 'QBFS',
    });

    // Create response with file download headers
    const filename = `financial-hub-${company.code || company.id}.qwc`;

    return new NextResponse(qwcContent, {
      status: 200,
      headers: {
        'Content-Type': 'application/x-qwc',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error('[QWC Generator] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/sync/qwc - Generate QWC file with custom settings
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

    const body = await request.json();
    const { companyId, userName, schedulerMinutes } = body;

    if (!companyId) {
      return NextResponse.json({ error: 'Company ID is required' }, { status: 400 });
    }

    // Get company
    const { data: company, error: companyError } = await supabase
      .from('companies')
      .select('id, name, code')
      .eq('id', companyId)
      .single();

    if (companyError || !company) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    }

    // Get base URL from environment or request
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;

    // Generate QWC file with custom settings
    const qwcContent = generateQWCFile({
      appName: `Financial Hub - ${company.name}`,
      appId: 'FinancialHub',
      appUrl: `${baseUrl}/api/qbwc`,
      appDescription: `Sync transactions and receipts between Financial Hub and QuickBooks for ${company.name}`,
      appSupport: `${baseUrl}/support`,
      userName: userName || process.env.QBWC_USERNAME || 'admin',
      ownerId: generateFileId(),
      fileId: generateFileId(),
      qbType: 'QBFS',
      scheduler: schedulerMinutes
        ? { everyMinutes: parseInt(schedulerMinutes, 10) }
        : undefined,
    });

    // Return JSON with the content (for preview) and download URL
    return NextResponse.json({
      success: true,
      content: qwcContent,
      filename: `financial-hub-${company.code || company.id}.qwc`,
      instructions: [
        '1. Save the QWC file to your computer',
        '2. Open QuickBooks Web Connector',
        '3. Click "Add an application"',
        '4. Select the saved QWC file',
        '5. Authorize the application when prompted',
        '6. Set the password (must match QBWC_PASSWORD in your environment)',
        '7. Click "Update Selected" to start syncing',
      ],
    });
  } catch (error) {
    console.error('[QWC Generator] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
