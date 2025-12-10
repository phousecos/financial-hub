// app/api/qbwc/route.ts - QB Web Connector SOAP Endpoint

import { NextRequest, NextResponse } from 'next/server';
import { handleSOAPRequest, generateWSDL } from '@/lib/qbwc/soap-handler';
import { createClient } from '@supabase/supabase-js';
import type { QBOperationType } from '@/lib/qbxml/types';
import {
  parseVendorQueryResponse,
  parseCustomerQueryResponse,
  parseAccountQueryResponse,
  parseCheckQueryResponse,
  parseBillQueryResponse,
  parseCreditCardChargeQueryResponse,
  parseCheckAddResponse,
  parseBillAddResponse,
  parseCreditCardChargeAddResponse,
} from '@/lib/qbxml/parser';
import { getSession, getCurrentOperation } from '@/lib/qbwc/session-manager';

// Create Supabase client with service role for background processing
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

/**
 * Validate QBWC credentials against database
 * Username format: sync-{companyCode} or sync-{first8chars-of-companyId}
 */
async function validateCredentials(
  username: string,
  password: string
): Promise<{ valid: boolean; companyId?: string; companyFile?: string }> {
  const envPassword = process.env.QBWC_PASSWORD;

  // Check password matches environment variable
  if (!envPassword || password !== envPassword) {
    console.log('[QBWC] Invalid password');
    return { valid: false };
  }

  // Parse username to extract company identifier
  // Format: sync-{code} or sync-{id-prefix}
  if (!username.startsWith('sync-')) {
    console.log('[QBWC] Invalid username format:', username);
    return { valid: false };
  }

  const companyIdentifier = username.substring(5); // Remove 'sync-' prefix

  console.log('[QBWC] Looking up company by identifier:', companyIdentifier);

  // Try to find company by code first (case-insensitive)
  let { data: company } = await supabase
    .from('companies')
    .select('id, code, qb_file_path')
    .ilike('code', companyIdentifier)
    .eq('active', true)
    .single();

  // If not found by code, try by ID prefix
  if (!company) {
    const { data: companies } = await supabase
      .from('companies')
      .select('id, code, qb_file_path')
      .eq('active', true);

    // Find company where ID starts with the identifier
    company = companies?.find(c =>
      c.id.toLowerCase().startsWith(companyIdentifier.toLowerCase())
    ) || null;
  }

  if (!company) {
    console.log('[QBWC] Company not found for identifier:', companyIdentifier);
    return { valid: false };
  }

  console.log('[QBWC] Found company:', company.id, company.code);

  return {
    valid: true,
    companyId: company.id,
    companyFile: company.qb_file_path || undefined,
  };
}

/**
 * Process QB response and update database
 */
async function processResponse(
  companyId: string,
  operationType: QBOperationType,
  response: string,
  operationData?: Record<string, unknown>
): Promise<void> {
  console.log('[QBWC] Processing response for:', operationType);

  try {
    let recordsProcessed = 0;
    const isPushOperation = operationType.startsWith('add_') || operationType.startsWith('mod_');
    const direction = isPushOperation ? 'to_qb' : 'from_qb';

    switch (operationType) {
      // ================== PULL OPERATIONS ==================
      case 'query_vendors': {
        const result = parseVendorQueryResponse(response);
        if (result.success && result.data) {
          console.log('[QBWC] Received', result.data.length, 'vendors');
          recordsProcessed = result.data.length;
          // TODO: Store vendors in database for matching purposes
        }
        break;
      }

      case 'query_customers': {
        const result = parseCustomerQueryResponse(response);
        if (result.success && result.data) {
          console.log('[QBWC] Received', result.data.length, 'customers');
          recordsProcessed = result.data.length;
          // TODO: Store customers in database
        }
        break;
      }

      case 'query_accounts': {
        const result = parseAccountQueryResponse(response);
        if (result.success && result.data) {
          console.log('[QBWC] Received', result.data.length, 'accounts');
          recordsProcessed = result.data.length;
          // TODO: Store accounts for bank account mapping
        }
        break;
      }

      case 'query_checks': {
        const result = parseCheckQueryResponse(response);
        if (result.success && result.data) {
          console.log('[QBWC] Received', result.data.length, 'checks');
          for (const check of result.data) {
            await importQBTransaction(companyId, 'Check', check.txnID, {
              amount: check.amount,
              transaction_date: check.txnDate,
              payee: check.payeeRef?.fullName,
              description: check.memo,
              external_ref: check.refNumber,
            });
            recordsProcessed++;
          }
        }
        break;
      }

      case 'query_bills': {
        const result = parseBillQueryResponse(response);
        if (result.success && result.data) {
          console.log('[QBWC] Received', result.data.length, 'bills');
          for (const bill of result.data) {
            await importQBTransaction(companyId, 'Bill', bill.txnID, {
              amount: bill.amount,
              transaction_date: bill.txnDate,
              payee: bill.vendorRef?.fullName,
              description: bill.memo,
              external_ref: bill.refNumber,
            });
            recordsProcessed++;
          }
        }
        break;
      }

      case 'query_credit_cards': {
        const result = parseCreditCardChargeQueryResponse(response);
        if (result.success && result.data) {
          console.log('[QBWC] Received', result.data.length, 'credit card charges');
          for (const charge of result.data) {
            await importQBTransaction(companyId, 'CreditCardCharge', charge.txnID, {
              amount: charge.amount,
              transaction_date: charge.txnDate,
              payee: charge.payeeRef?.fullName,
              description: charge.memo,
              external_ref: charge.refNumber,
            });
            recordsProcessed++;
          }
        }
        break;
      }

      // ================== PUSH OPERATIONS ==================
      case 'add_check': {
        const result = parseCheckAddResponse(response);
        if (result.success && result.data) {
          console.log('[QBWC] Created check in QB:', result.data.txnID);
          // Update the local transaction with QB TxnID
          if (operationData?.transactionId) {
            await updateTransactionWithQBTxnId(
              operationData.transactionId as string,
              result.data.txnID,
              'Check',
              result.data.editSequence
            );
            recordsProcessed = 1;
          }
        } else {
          console.error('[QBWC] Failed to create check:', result.statusMessage);
        }
        break;
      }

      case 'add_bill': {
        const result = parseBillAddResponse(response);
        if (result.success && result.data) {
          console.log('[QBWC] Created bill in QB:', result.data.txnID);
          if (operationData?.transactionId) {
            await updateTransactionWithQBTxnId(
              operationData.transactionId as string,
              result.data.txnID,
              'Bill',
              result.data.editSequence
            );
            recordsProcessed = 1;
          }
        } else {
          console.error('[QBWC] Failed to create bill:', result.statusMessage);
        }
        break;
      }

      case 'add_credit_card_charge': {
        const result = parseCreditCardChargeAddResponse(response);
        if (result.success && result.data) {
          console.log('[QBWC] Created credit card charge in QB:', result.data.txnID);
          if (operationData?.transactionId) {
            await updateTransactionWithQBTxnId(
              operationData.transactionId as string,
              result.data.txnID,
              'CreditCardCharge',
              result.data.editSequence
            );
            recordsProcessed = 1;
          }
        } else {
          console.error('[QBWC] Failed to create credit card charge:', result.statusMessage);
        }
        break;
      }

      case 'mod_check':
      case 'mod_bill': {
        // For mod operations, just log success
        console.log('[QBWC] Modified transaction in QB');
        recordsProcessed = 1;
        break;
      }

      default:
        console.log('[QBWC] No handler for operation type:', operationType);
    }

    // Log the sync operation
    await supabase.from('sync_log').insert({
      company_id: companyId,
      sync_type: operationType,
      direction,
      status: 'success',
      records_processed: recordsProcessed,
      records_failed: 0,
      qbxml_response: response.substring(0, 10000), // Truncate if too long
      started_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[QBWC] Error processing response:', error);

    const isPushOperation = operationType.startsWith('add_') || operationType.startsWith('mod_');
    const direction = isPushOperation ? 'to_qb' : 'from_qb';

    // Log the error
    await supabase.from('sync_log').insert({
      company_id: companyId,
      sync_type: operationType,
      direction,
      status: 'error',
      records_processed: 0,
      records_failed: 1,
      error_message: error instanceof Error ? error.message : 'Unknown error',
      qbxml_response: response.substring(0, 10000),
      started_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
    });
  }
}

/**
 * Update transaction with QB TxnID after successful push
 */
async function updateTransactionWithQBTxnId(
  transactionId: string,
  qbTxnId: string,
  qbTxnType: string,
  editSequence: string
): Promise<void> {
  const { error } = await supabase
    .from('transactions')
    .update({
      qb_txn_id: qbTxnId,
      qb_txn_type: qbTxnType,
      qb_edit_sequence: editSequence,
      needs_qb_push: false,
      updated_at: new Date().toISOString(),
    })
    .eq('id', transactionId);

  if (error) {
    console.error('[QBWC] Error updating transaction with QB TxnID:', error);
    throw error;
  }

  console.log('[QBWC] Updated transaction', transactionId, 'with QB TxnID:', qbTxnId);
}

/**
 * Import a QB transaction into the database
 */
async function importQBTransaction(
  companyId: string,
  txnType: string,
  qbTxnId: string,
  data: {
    amount: number;
    transaction_date: string;
    payee?: string;
    description?: string;
    external_ref?: string;
  }
): Promise<void> {
  // Check if transaction already exists
  const { data: existing } = await supabase
    .from('transactions')
    .select('id')
    .eq('company_id', companyId)
    .eq('qb_txn_id', qbTxnId)
    .single();

  if (existing) {
    console.log('[QBWC] Transaction already exists:', qbTxnId);
    return;
  }

  // Insert new transaction
  const { error } = await supabase.from('transactions').insert({
    company_id: companyId,
    amount: data.amount,
    transaction_date: data.transaction_date,
    payee: data.payee,
    description: data.description,
    external_ref: data.external_ref,
    qb_txn_id: qbTxnId,
    qb_txn_type: txnType,
    source: 'qb_pull',
    status: 'unmatched',
    needs_qb_push: false,
    receipt_matched: false,
  });

  if (error) {
    console.error('[QBWC] Error inserting transaction:', error);
    throw error;
  }

  console.log('[QBWC] Imported transaction:', qbTxnId);
}

/**
 * Handle GET request (WSDL)
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const url = new URL(request.url);

  // Return WSDL if ?wsdl parameter is present
  if (url.searchParams.has('wsdl')) {
    const serviceUrl = `${url.origin}/api/qbwc`;
    const wsdl = generateWSDL(serviceUrl);

    return new NextResponse(wsdl, {
      status: 200,
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
      },
    });
  }

  // Otherwise return info
  return NextResponse.json({
    service: 'QB Web Connector SOAP Service',
    wsdl: `${url.origin}/api/qbwc?wsdl`,
    status: 'ready',
  });
}

/**
 * Handle POST request (SOAP)
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const contentType = request.headers.get('content-type') || '';

    // Must be SOAP/XML request
    if (!contentType.includes('text/xml') && !contentType.includes('application/soap+xml')) {
      return new NextResponse('Invalid content type', { status: 415 });
    }

    const soapXml = await request.text();

    if (!soapXml) {
      return new NextResponse('Empty request body', { status: 400 });
    }

    // Handle the SOAP request
    const response = await handleSOAPRequest(soapXml, {
      validateCredentials,
      processResponse,
    });

    return new NextResponse(response, {
      status: 200,
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
      },
    });
  } catch (error) {
    console.error('[QBWC] Error handling SOAP request:', error);

    // Return SOAP fault
    const fault = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
<soap:Body>
<soap:Fault>
<faultcode>soap:Server</faultcode>
<faultstring>Internal server error</faultstring>
</soap:Fault>
</soap:Body>
</soap:Envelope>`;

    return new NextResponse(fault, {
      status: 500,
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
      },
    });
  }
}
