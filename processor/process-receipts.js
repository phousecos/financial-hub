// process-receipts.js - Google Drive Receipt Processor
require('dotenv').config();
const { google } = require('googleapis');
const Anthropic = require('@anthropic-ai/sdk');
const { createClient } = require('@supabase/supabase-js');

// Configuration
const CONFIG = {
  DRIVE_FOLDER_ID: process.env.DRIVE_UNPROCESSED_FOLDER_ID,
  DRIVE_PROCESSED_FOLDER_ID: process.env.DRIVE_PROCESSED_FOLDER_ID,
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_KEY: process.env.SUPABASE_ANON_KEY,
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  GOOGLE_SERVICE_ACCOUNT: process.env.GOOGLE_SERVICE_ACCOUNT_PATH,
};

// Initialize clients
const anthropic = new Anthropic({ apiKey: CONFIG.ANTHROPIC_API_KEY });
const supabase = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY);

// Initialize Google Drive
const auth = new google.auth.GoogleAuth({
  keyFile: CONFIG.GOOGLE_SERVICE_ACCOUNT,
  scopes: ['https://www.googleapis.com/auth/drive'],
});
const drive = google.drive({ version: 'v3', auth });

// Known company codes
const COMPANY_CODES = {
  'PII': 'Powerhouse Industries',
  'UPH': 'Unlimited Powerhouse',
  'APMO': 'AgentPMO',
  'LUM': 'Lumynr',
  'INF': 'Inflections',
  'VG': 'Vetters Group LLC',
};

async function processReceipts() {
  console.log('🔍 Checking for new receipts...');
  
  try {
    const response = await drive.files.list({
      q: `'${CONFIG.DRIVE_FOLDER_ID}' in parents and trashed=false and (mimeType contains 'image/' or mimeType='application/pdf')`,
      fields: 'files(id, name, mimeType, createdTime)',
      orderBy: 'createdTime desc',
    });

    const files = response.data.files;
    
    if (!files || files.length === 0) {
      console.log('✅ No new receipts to process');
      return;
    }

    console.log(`📄 Found ${files.length} file(s) to process`);

    for (const file of files) {
      await processFile(file);
    }

    console.log('✨ Processing complete!');
  } catch (error) {
    console.error('❌ Error processing receipts:', error);
  }
}

async function processFile(file) {
  console.log(`\n📋 Processing: ${file.name}`);
  
  try {
    const fileData = await downloadFile(file.id);
    const receiptData = await extractReceiptData(fileData, file.mimeType, file.name);
    
    if (!receiptData) {
      console.log('⚠️  Could not extract receipt data');
      return;
    }

    console.log('📊 Extracted:', receiptData);

    const companyId = await findCompany(receiptData.companyName);
    
    if (!companyId) {
      console.log(`⚠️  Company not found: ${receiptData.companyName}`);
      return;
    }

    const storagePath = await uploadToSupabase(fileData, file.name, file.mimeType, companyId);
    
    const receipt = await createReceipt({
      company_id: companyId,
      amount: receiptData.amount,
      transaction_date: receiptData.date,
      description: receiptData.description,
      vendor: receiptData.vendor,
      file_url: storagePath,
      file_name: file.name,
      file_type: file.mimeType,
      email_subject: null,
      email_from: 'drive_import',
      email_received_at: file.createdTime,
      matched: false,
    });

    console.log('✅ Receipt created:', receipt.id);
    await moveToProcessed(file.id, receiptData.companyName);
    
  } catch (error) {
    console.error(`❌ Error processing ${file.name}:`, error.message);
  }
}

async function downloadFile(fileId) {
  const response = await drive.files.get(
    { fileId, alt: 'media' },
    { responseType: 'arraybuffer' }
  );
  return Buffer.from(response.data);
}

async function extractReceiptData(fileBuffer, mimeType, fileName) {
  try {
    const base64Data = fileBuffer.toString('base64');
    
    console.log('🤖 Sending to Claude Vision API...');

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'document',
              source: {
                type: 'base64',
                media_type: mimeType,
                data: base64Data
              }
            },
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

Use "UNKNOWN" if field cannot be determined.`
            }
          ]
        }
      ]
    });

    const responseText = message.content[0].text;
    console.log('AI Response:', responseText);

    const lines = responseText.split('\n').filter(l => l.trim());
    const parsed = {};
    
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
  } catch (error) {
    console.error('Error calling Claude API:', error);
    return null;
  }
}

async function findCompany(companyCode) {
  let { data: company } = await supabase
    .from('companies')
    .select('id')
    .eq('code', companyCode.toUpperCase().trim())
    .single();

  if (!company) {
    const { data: nameMatch } = await supabase
      .from('companies')
      .select('id')
      .ilike('name', `%${companyCode}%`)
      .single();
    company = nameMatch;
  }

  return company?.id || null;
}

async function uploadToSupabase(fileBuffer, fileName, mimeType, companyId) {
  const filePath = `${companyId}/${Date.now()}-${fileName}`;
  
  const { data, error } = await supabase.storage
    .from('receipts')
    .upload(filePath, fileBuffer, {
      contentType: mimeType,
      cacheControl: '3600',
      upsert: false,
    });

  if (error) {
    throw new Error(`Upload failed: ${error.message}`);
  }

  const { data: urlData } = supabase.storage
    .from('receipts')
    .getPublicUrl(data.path);

  return urlData.publicUrl;
}

async function createReceipt(receiptData) {
  const { data, error } = await supabase
    .from('receipts')
    .insert([receiptData])
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create receipt: ${error.message}`);
  }

  return data;
}

async function moveToProcessed(fileId, companyName) {
  try {
    const folderName = companyName;
    
    const folderQuery = await drive.files.list({
      q: `'${CONFIG.DRIVE_PROCESSED_FOLDER_ID}' in parents and name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: 'files(id)',
    });

    let companyFolderId;
    if (folderQuery.data.files.length > 0) {
      companyFolderId = folderQuery.data.files[0].id;
    } else {
      const folder = await drive.files.create({
        requestBody: {
          name: folderName,
          mimeType: 'application/vnd.google-apps.folder',
          parents: [CONFIG.DRIVE_PROCESSED_FOLDER_ID],
        },
        fields: 'id',
      });
      companyFolderId = folder.data.id;
    }

    await drive.files.update({
      fileId: fileId,
      addParents: companyFolderId,
      removeParents: CONFIG.DRIVE_FOLDER_ID,
      fields: 'id, parents',
    });

    console.log(`📁 Moved to: Processed/${folderName}/`);
  } catch (error) {
    console.error('Error moving file:', error.message);
  }
}

processReceipts()
  .then(() => {
    console.log('\n✨ Done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });