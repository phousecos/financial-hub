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
} from '@/lib/qbxml/parser';

// Create Supabase client with service role for background processing
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

/**
 * Validate QBWC credentials against database
 */
async function validateCredentials(
  username: string,
  password: string
): Promise<{ valid: boolean; companyId?: string; companyFile?: string }> {
  // Check for QBWC credentials in environment (simple setup)
  const envUsername = process.env.QBWC_USERNAME;
  const envPassword = process.env.QBWC_PASSWORD;
  const envCompanyId = process.env.QBWC_DEFAULT_COMPANY_ID;

  if (envUsername && envPassword) {
    if (username === envUsername && password === envPassword) {
      // Get company file path from database
      if (envCompanyId) {
        const { data: company } = await supabase
          .from('companies')
          .select('id, qb_file_path')
          .eq('id', envCompanyId)
          .single();

        if (company) {
          return {
            valid: true,
            companyId: company.id,
            companyFile: company.qb_file_path || undefined,
          };
        }
      }

      // Return without specific company (will use whatever QB has open)
      return { valid: true, companyId: envCompanyId };
    }
  }

  // TODO: In production, you might want to store QBWC credentials in a qbwc_users table
  // and validate against that, with proper password hashing

  return { valid: false };
}

/**
 * Process QB response and update database
 */
async function processResponse(
  companyId: string,
  operationType: QBOperationType,
  response: string
): Promise<void> {
  console.log('[QBWC] Processing response for:', operationType);

  try {
    switch (operationType) {
      case 'query_vendors': {
        const result = parseVendorQueryResponse(response);
        if (result.success && result.data) {
          console.log('[QBWC] Received', result.data.length, 'vendors');
          // TODO: Store vendors in database for matching purposes
          // Could be a qb_vendors table or vendor field autocomplete
        }
        break;
      }

      case 'query_customers': {
        const result = parseCustomerQueryResponse(response);
        if (result.success && result.data) {
          console.log('[QBWC] Received', result.data.length, 'customers');
          // TODO: Store customers in database
        }
        break;
      }

      case 'query_accounts': {
        const result = parseAccountQueryResponse(response);
        if (result.success && result.data) {
          console.log('[QBWC] Received', result.data.length, 'accounts');
          // TODO: Store accounts for bank account mapping
        }
        break;
      }

      case 'query_checks': {
        const result = parseCheckQueryResponse(response);
        if (result.success && result.data) {
          console.log('[QBWC] Received', result.data.length, 'checks');
          // Import checks as transactions
          for (const check of result.data) {
            await importQBTransaction(companyId, 'Check', check.txnID, {
              amount: check.amount,
              transaction_date: check.txnDate,
              payee: check.payeeRef?.fullName,
              description: check.memo,
              external_ref: check.refNumber,
            });
          }
        }
        break;
      }

      case 'query_bills': {
        const result = parseBillQueryResponse(response);
        if (result.success && result.data) {
          console.log('[QBWC] Received', result.data.length, 'bills');
          // Import bills as transactions
          for (const bill of result.data) {
            await importQBTransaction(companyId, 'Bill', bill.txnID, {
              amount: bill.amount,
              transaction_date: bill.txnDate,
              payee: bill.vendorRef?.fullName,
              description: bill.memo,
              external_ref: bill.refNumber,
            });
          }
        }
        break;
      }

      case 'query_credit_cards': {
        const result = parseCreditCardChargeQueryResponse(response);
        if (result.success && result.data) {
          console.log('[QBWC] Received', result.data.length, 'credit card charges');
          // Import CC charges as transactions
          for (const charge of result.data) {
            await importQBTransaction(companyId, 'CreditCardCharge', charge.txnID, {
              amount: charge.amount,
              transaction_date: charge.txnDate,
              payee: charge.payeeRef?.fullName,
              description: charge.memo,
              external_ref: charge.refNumber,
            });
          }
        }
        break;
      }

      default:
        console.log('[QBWC] No handler for operation type:', operationType);
    }

    // Log the sync operation
    await supabase.from('sync_log').insert({
      company_id: companyId,
      sync_type: operationType,
      direction: 'from_qb',
      status: 'success',
      records_processed: 1,
      records_failed: 0,
      qbxml_response: response.substring(0, 10000), // Truncate if too long
      started_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[QBWC] Error processing response:', error);

    // Log the error
    await supabase.from('sync_log').insert({
      company_id: companyId,
      sync_type: operationType,
      direction: 'from_qb',
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
