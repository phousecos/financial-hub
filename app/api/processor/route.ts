// app/api/processor/route.ts - Google Drive Receipt Processor API
// This endpoint can be called by Vercel Cron, external cron jobs, or manually

import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';

// Configuration from environment variables
const CONFIG = {
  DRIVE_FOLDER_ID: process.env.DRIVE_UNPROCESSED_FOLDER_ID,
  DRIVE_PROCESSED_FOLDER_ID: process.env.DRIVE_PROCESSED_FOLDER_ID,
  SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL!,
  SUPABASE_KEY: process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  GOOGLE_SERVICE_ACCOUNT: process.env.GOOGLE_SERVICE_ACCOUNT_JSON,
  PROCESSOR_SECRET: process.env.PROCESSOR_SECRET, // Optional: for securing the endpoint
  BATCH_SIZE: 3, // Process only this many files per run to avoid timeout
};

// Extend function timeout (Pro plan allows up to 60s, Enterprise up to 300s)
export const maxDuration = 60;

// Known company codes
const COMPANY_CODES: Record<string, string> = {
  'PII': 'Powerhouse Industries',
  'UPH': 'Unlimited Powerhouse',
  'APMO': 'AgentPMO',
  'LUM': 'Lumynr',
  'INF': 'Inflections',
  'VG': 'Vetters Group LLC',
};

interface ProcessResult {
  processed: number;
  total: number;
  remaining: number;
  errors: string[];
  files: { name: string; status: string; receiptId?: string }[];
  debug?: {
    allFilesInFolder: number;
    fileTypes: { name: string; type: string }[];
  };
}

// Verify the request has proper authorization
function verifyAuthorization(request: Request): boolean {
  // If no secret is configured, allow all requests (dev mode)
  if (!CONFIG.PROCESSOR_SECRET) {
    return true;
  }

  const authHeader = request.headers.get('authorization');
  if (!authHeader) {
    return false;
  }

  const token = authHeader.replace('Bearer ', '');
  return token === CONFIG.PROCESSOR_SECRET;
}

export async function GET(request: Request) {
  // Verify authorization
  if (!verifyAuthorization(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Check configuration
  if (!CONFIG.DRIVE_FOLDER_ID || !CONFIG.ANTHROPIC_API_KEY || !CONFIG.GOOGLE_SERVICE_ACCOUNT) {
    return NextResponse.json({
      error: 'Missing configuration',
      details: {
        hasDriveFolder: !!CONFIG.DRIVE_FOLDER_ID,
        hasAnthropicKey: !!CONFIG.ANTHROPIC_API_KEY,
        hasServiceAccount: !!CONFIG.GOOGLE_SERVICE_ACCOUNT,
      }
    }, { status: 500 });
  }

  try {
    const result = await processReceipts();
    return NextResponse.json({
      success: true,
      ...result,
      timestamp: new Date().toISOString(),
      config: {
        folderId: CONFIG.DRIVE_FOLDER_ID ? `...${CONFIG.DRIVE_FOLDER_ID.slice(-8)}` : 'NOT SET',
      },
    });
  } catch (error) {
    console.error('Processor error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
    }, { status: 500 });
  }
}

// Also support POST for manual triggers with potential options
export async function POST(request: Request) {
  return GET(request);
}

async function processReceipts(): Promise<ProcessResult> {
  const result: ProcessResult = { processed: 0, total: 0, remaining: 0, errors: [], files: [] };

  // Initialize clients
  const anthropic = new Anthropic({ apiKey: CONFIG.ANTHROPIC_API_KEY });
  const supabase = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY);

  // Parse service account JSON from environment
  const serviceAccount = JSON.parse(CONFIG.GOOGLE_SERVICE_ACCOUNT!);
  const auth = new google.auth.GoogleAuth({
    credentials: serviceAccount,
    scopes: ['https://www.googleapis.com/auth/drive'],
  });
  const drive = google.drive({ version: 'v3', auth });

  // First, list ALL files in the folder to help debug
  const allFilesResponse = await drive.files.list({
    q: `'${CONFIG.DRIVE_FOLDER_ID}' in parents and trashed=false`,
    fields: 'files(id, name, mimeType)',
    pageSize: 100,
  });
  const allFilesInFolder = allFilesResponse.data.files || [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  console.log(`Total files in folder: ${allFilesInFolder.length}`, allFilesInFolder.map((f: any) => ({ name: f.name, type: f.mimeType })));

  // List files in the unprocessed folder (only images and PDFs)
  const response = await drive.files.list({
    q: `'${CONFIG.DRIVE_FOLDER_ID}' in parents and trashed=false and (mimeType contains 'image/' or mimeType='application/pdf')`,
    fields: 'files(id, name, mimeType, createdTime)',
    orderBy: 'createdTime desc',
  });

  const files = response.data.files;

  if (!files || files.length === 0) {
    // Return debug info about what IS in the folder
    return {
      processed: 0,
      total: 0,
      remaining: 0,
      errors: [],
      files: [],
      debug: {
        allFilesInFolder: allFilesInFolder.length,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        fileTypes: allFilesInFolder.map((f: any) => ({ name: f.name, type: f.mimeType })).slice(0, 10),
      }
    };
  }

  result.total = files.length;

  // Limit to batch size to avoid timeout (cron runs every 5 min, so will process all eventually)
  const filesToProcess = files.slice(0, CONFIG.BATCH_SIZE);
  result.remaining = Math.max(0, files.length - filesToProcess.length);
  console.log(`Processing ${filesToProcess.length} of ${files.length} files (batch size: ${CONFIG.BATCH_SIZE}), ${result.remaining} remaining`);

  for (const file of filesToProcess) {
    try {
      const fileResult = await processFile(file, drive, anthropic, supabase);
      result.files.push(fileResult);
      if (fileResult.status.startsWith('success')) {
        result.processed++;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      result.errors.push(`${file.name}: ${errorMessage}`);
      result.files.push({ name: file.name!, status: 'error' });
    }
  }

  return result;
}

interface DriveFile {
  id?: string | null;
  name?: string | null;
  mimeType?: string | null;
  createdTime?: string | null;
}

async function processFile(
  file: DriveFile,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  drive: any,
  anthropic: Anthropic,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any
): Promise<{ name: string; status: string; receiptId?: string }> {
  const fileName = file.name || 'unknown';

  // Check for duplicate - skip if receipt with same file_name already exists
  const { data: existingReceipt } = await supabase
    .from('receipts')
    .select('id, company:companies(name, code)')
    .eq('file_name', fileName)
    .maybeSingle();

  if (existingReceipt) {
    // Move file to processed folder even though it's a duplicate
    const companyName = existingReceipt.company?.code || existingReceipt.company?.name || 'Unknown';
    await moveToProcessed(file.id!, companyName, drive);
    return { name: fileName, status: 'skipped - already processed (moved to processed)', receiptId: existingReceipt.id };
  }

  // Download file
  const fileResponse = await drive.files.get(
    { fileId: file.id, alt: 'media' },
    { responseType: 'arraybuffer' }
  );
  const fileBuffer = Buffer.from(fileResponse.data);

  // Extract data with Claude Vision
  const receiptData = await extractReceiptData(fileBuffer, file.mimeType!, fileName, anthropic);

  if (!receiptData) {
    // Move to processed/failed so it doesn't retry forever
    await moveToProcessed(file.id!, 'Failed', drive);
    return { name: fileName, status: 'skipped - could not extract data (moved to Failed folder)' };
  }

  // Find company
  const { data: company } = await supabase
    .from('companies')
    .select('id')
    .eq('code', receiptData.companyName.toUpperCase().trim())
    .single();

  let companyId = company?.id;

  if (!companyId) {
    // Try name match
    const { data: nameMatch } = await supabase
      .from('companies')
      .select('id')
      .ilike('name', `%${receiptData.companyName}%`)
      .single();
    companyId = nameMatch?.id;
  }

  // Upload to Supabase Storage (use 'unassigned' folder if no company)
  const folderName = companyId || 'unassigned';
  const storagePath = `${folderName}/${Date.now()}-${fileName}`;
  const { error: uploadError } = await supabase.storage
    .from('receipts')
    .upload(storagePath, fileBuffer, {
      contentType: file.mimeType!,
      cacheControl: '3600',
      upsert: false,
    });

  if (uploadError) {
    throw new Error(`Upload failed: ${uploadError.message}`);
  }

  // Create receipt record - store path (not public URL) so signed URLs can be generated
  const { data: receipt, error: receiptError } = await supabase
    .from('receipts')
    .insert([{
      company_id: companyId,
      amount: receiptData.amount,
      transaction_date: receiptData.date,
      description: receiptData.description,
      vendor: receiptData.vendor,
      file_url: storagePath,
      file_name: fileName,
      file_type: file.mimeType,
      email_subject: null,
      email_from: 'drive_import',
      email_received_at: file.createdTime,
      matched: false,
    }])
    .select()
    .single();

  if (receiptError) {
    throw new Error(`Failed to create receipt: ${receiptError.message}`);
  }

  // Move file to processed folder
  await moveToProcessed(file.id!, receiptData.companyName || 'Unassigned', drive);

  const status = companyId
    ? 'success'
    : `success (no company match for "${receiptData.companyName}" - needs manual assignment)`;
  return { name: fileName, status, receiptId: receipt.id };
}

async function extractReceiptData(
  fileBuffer: Buffer,
  mimeType: string,
  fileName: string,
  anthropic: Anthropic
): Promise<{
  companyName: string;
  amount: number;
  vendor: string | null;
  date: string;
  description: string | null;
} | null> {
  const base64Data = fileBuffer.toString('base64');

  // Build content based on file type - use 'image' for images, 'document' for PDFs
  type ImageMediaType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
  const isImage = mimeType.startsWith('image/');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let contentBlock: any;

  if (isImage) {
    contentBlock = {
      type: 'image',
      source: {
        type: 'base64',
        media_type: mimeType as ImageMediaType,
        data: base64Data,
      },
    };
  } else {
    // PDF
    contentBlock = {
      type: 'document',
      source: {
        type: 'base64',
        media_type: 'application/pdf' as const,
        data: base64Data,
      },
    };
  }

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: [
          contentBlock,
          {
            type: 'text',
            text: `Extract receipt information.

Companies:
${Object.entries(COMPANY_CODES).map(([code, name]) => `- ${code}: ${name}`).join('\n')}

Return format:
COMPANY: [code]
AMOUNT: [number]
VENDOR: [vendor name]
DATE: [YYYY-MM-DD]
DESCRIPTION: [description]

Use "UNKNOWN" if field cannot be determined.`,
          },
        ],
      },
    ],
  });

  const responseText = (message.content[0] as { type: 'text'; text: string }).text;

  const lines = responseText.split('\n').filter(l => l.trim());
  const parsed: Record<string, string> = {};

  for (const line of lines) {
    const [key, ...valueParts] = line.split(':');
    const value = valueParts.join(':').trim();

    if (key.includes('COMPANY')) parsed.company = value;
    if (key.includes('AMOUNT')) parsed.amount = value;
    if (key.includes('VENDOR')) parsed.vendor = value;
    if (key.includes('DATE')) parsed.date = value;
    if (key.includes('DESCRIPTION')) parsed.description = value;
  }

  if (!parsed.company || parsed.company === 'UNKNOWN' ||
      !parsed.amount || parsed.amount === 'UNKNOWN') {
    return null;
  }

  const cleanAmount = parsed.amount.replace(/[^0-9.]/g, '');

  return {
    companyName: parsed.company,
    amount: parseFloat(cleanAmount),
    vendor: parsed.vendor !== 'UNKNOWN' ? parsed.vendor : null,
    date: parsed.date !== 'UNKNOWN' ? parsed.date : new Date().toISOString().split('T')[0],
    description: parsed.description !== 'UNKNOWN' ? parsed.description : fileName,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function moveToProcessed(fileId: string, companyName: string, drive: any): Promise<void> {
  if (!CONFIG.DRIVE_PROCESSED_FOLDER_ID) {
    return;
  }

  try {
    // Check if company folder exists
    const folderQuery = await drive.files.list({
      q: `'${CONFIG.DRIVE_PROCESSED_FOLDER_ID}' in parents and name='${companyName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: 'files(id)',
    });

    let companyFolderId: string;

    if (folderQuery.data.files && folderQuery.data.files.length > 0) {
      companyFolderId = folderQuery.data.files[0].id;
    } else {
      // Create company folder
      const folder = await drive.files.create({
        requestBody: {
          name: companyName,
          mimeType: 'application/vnd.google-apps.folder',
          parents: [CONFIG.DRIVE_PROCESSED_FOLDER_ID],
        },
        fields: 'id',
      });
      companyFolderId = folder.data.id;
    }

    // Move file
    await drive.files.update({
      fileId: fileId,
      addParents: companyFolderId,
      removeParents: CONFIG.DRIVE_FOLDER_ID,
      fields: 'id, parents',
    });
  } catch (error) {
    console.error('Error moving file to processed:', error);
  }
}
