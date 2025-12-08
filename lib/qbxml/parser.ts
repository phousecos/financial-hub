// lib/qbxml/parser.ts - QBXML Response Parser

import type {
  QBVendor,
  QBCustomer,
  QBAccount,
  QBItem,
  QBCheck,
  QBBill,
  QBCreditCardCharge,
  QBExpenseLine,
  QBItemLine,
} from './types';

/**
 * Parse error from QBXML response
 */
export interface QBXMLError {
  code: string;
  message: string;
  severity: 'Error' | 'Warning' | 'Info';
}

/**
 * Generic parse result
 */
export interface QBXMLParseResult<T> {
  success: boolean;
  data?: T;
  error?: QBXMLError;
  statusCode: string;
  statusMessage: string;
}

/**
 * Simple XML tag extractor (no external dependencies)
 */
function extractTag(xml: string, tagName: string): string | null {
  const regex = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'i');
  const match = xml.match(regex);
  return match ? match[1].trim() : null;
}

/**
 * Extract all occurrences of a tag
 */
function extractAllTags(xml: string, tagName: string): string[] {
  const regex = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'gi');
  const matches: string[] = [];
  let match;
  while ((match = regex.exec(xml)) !== null) {
    matches.push(match[1].trim());
  }
  return matches;
}

/**
 * Extract tag with full content (including nested tags)
 */
function extractFullTag(xml: string, tagName: string): string | null {
  const regex = new RegExp(`<${tagName}[^>]*>[\\s\\S]*?<\\/${tagName}>`, 'i');
  const match = xml.match(regex);
  return match ? match[0] : null;
}

/**
 * Extract all full tags
 */
function extractAllFullTags(xml: string, tagName: string): string[] {
  const regex = new RegExp(`<${tagName}[^>]*>[\\s\\S]*?<\\/${tagName}>`, 'gi');
  const matches: string[] = [];
  let match;
  while ((match = regex.exec(xml)) !== null) {
    matches.push(match[0]);
  }
  return matches;
}

/**
 * Unescape XML entities
 */
function unescapeXML(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

/**
 * Parse response status from any response element
 */
function parseResponseStatus(responseXml: string): { statusCode: string; statusMessage: string } {
  const statusCodeMatch = responseXml.match(/statusCode="([^"]*)"/);
  const statusMessageMatch = responseXml.match(/statusMessage="([^"]*)"/);

  return {
    statusCode: statusCodeMatch ? statusCodeMatch[1] : 'Unknown',
    statusMessage: statusMessageMatch ? unescapeXML(statusMessageMatch[1]) : 'Unknown error',
  };
}

/**
 * Check if response indicates success
 */
function isSuccessStatus(statusCode: string): boolean {
  // 0 = success, 1 = no data found (also valid)
  return statusCode === '0' || statusCode === '1';
}

// ============================================
// VENDOR PARSER
// ============================================

export function parseVendorQueryResponse(xml: string): QBXMLParseResult<QBVendor[]> {
  const responseXml = extractFullTag(xml, 'VendorQueryRs');
  if (!responseXml) {
    return {
      success: false,
      statusCode: 'ParseError',
      statusMessage: 'Could not find VendorQueryRs in response',
    };
  }

  const { statusCode, statusMessage } = parseResponseStatus(responseXml);

  if (!isSuccessStatus(statusCode)) {
    return { success: false, statusCode, statusMessage };
  }

  const vendorRets = extractAllFullTags(responseXml, 'VendorRet');
  const vendors: QBVendor[] = vendorRets.map((v) => ({
    listID: extractTag(v, 'ListID') || '',
    name: extractTag(v, 'Name') || '',
    isActive: extractTag(v, 'IsActive') === 'true',
    companyName: extractTag(v, 'CompanyName') || undefined,
    phone: extractTag(v, 'Phone') || undefined,
    email: extractTag(v, 'Email') || undefined,
    balance: extractTag(v, 'Balance') ? parseFloat(extractTag(v, 'Balance')!) : undefined,
  }));

  return { success: true, data: vendors, statusCode, statusMessage };
}

// ============================================
// CUSTOMER PARSER
// ============================================

export function parseCustomerQueryResponse(xml: string): QBXMLParseResult<QBCustomer[]> {
  const responseXml = extractFullTag(xml, 'CustomerQueryRs');
  if (!responseXml) {
    return {
      success: false,
      statusCode: 'ParseError',
      statusMessage: 'Could not find CustomerQueryRs in response',
    };
  }

  const { statusCode, statusMessage } = parseResponseStatus(responseXml);

  if (!isSuccessStatus(statusCode)) {
    return { success: false, statusCode, statusMessage };
  }

  const customerRets = extractAllFullTags(responseXml, 'CustomerRet');
  const customers: QBCustomer[] = customerRets.map((c) => ({
    listID: extractTag(c, 'ListID') || '',
    name: extractTag(c, 'Name') || '',
    fullName: extractTag(c, 'FullName') || '',
    isActive: extractTag(c, 'IsActive') === 'true',
    companyName: extractTag(c, 'CompanyName') || undefined,
    balance: extractTag(c, 'Balance') ? parseFloat(extractTag(c, 'Balance')!) : undefined,
  }));

  return { success: true, data: customers, statusCode, statusMessage };
}

// ============================================
// ACCOUNT PARSER
// ============================================

export function parseAccountQueryResponse(xml: string): QBXMLParseResult<QBAccount[]> {
  const responseXml = extractFullTag(xml, 'AccountQueryRs');
  if (!responseXml) {
    return {
      success: false,
      statusCode: 'ParseError',
      statusMessage: 'Could not find AccountQueryRs in response',
    };
  }

  const { statusCode, statusMessage } = parseResponseStatus(responseXml);

  if (!isSuccessStatus(statusCode)) {
    return { success: false, statusCode, statusMessage };
  }

  const accountRets = extractAllFullTags(responseXml, 'AccountRet');
  const accounts: QBAccount[] = accountRets.map((a) => ({
    listID: extractTag(a, 'ListID') || '',
    name: extractTag(a, 'Name') || '',
    fullName: extractTag(a, 'FullName') || '',
    accountType: extractTag(a, 'AccountType') || '',
    accountNumber: extractTag(a, 'AccountNumber') || undefined,
    balance: extractTag(a, 'Balance') ? parseFloat(extractTag(a, 'Balance')!) : undefined,
    isActive: extractTag(a, 'IsActive') === 'true',
  }));

  return { success: true, data: accounts, statusCode, statusMessage };
}

// ============================================
// ITEM PARSER
// ============================================

export function parseItemQueryResponse(xml: string): QBXMLParseResult<QBItem[]> {
  const responseXml = extractFullTag(xml, 'ItemQueryRs');
  if (!responseXml) {
    return {
      success: false,
      statusCode: 'ParseError',
      statusMessage: 'Could not find ItemQueryRs in response',
    };
  }

  const { statusCode, statusMessage } = parseResponseStatus(responseXml);

  if (!isSuccessStatus(statusCode)) {
    return { success: false, statusCode, statusMessage };
  }

  // Items can be ItemServiceRet, ItemInventoryRet, etc.
  const items: QBItem[] = [];

  // Parse service items
  const serviceRets = extractAllFullTags(responseXml, 'ItemServiceRet');
  serviceRets.forEach((s) => {
    items.push({
      listID: extractTag(s, 'ListID') || '',
      name: extractTag(s, 'Name') || '',
      fullName: extractTag(s, 'FullName') || '',
      itemType: 'Service',
      isActive: extractTag(s, 'IsActive') === 'true',
      description: extractTag(s, 'SalesOrPurchase/Desc') || extractTag(s, 'SalesDesc') || undefined,
      price: extractTag(s, 'SalesOrPurchase/Price') ? parseFloat(extractTag(s, 'SalesOrPurchase/Price')!) : undefined,
    });
  });

  // Parse inventory items
  const inventoryRets = extractAllFullTags(responseXml, 'ItemInventoryRet');
  inventoryRets.forEach((i) => {
    items.push({
      listID: extractTag(i, 'ListID') || '',
      name: extractTag(i, 'Name') || '',
      fullName: extractTag(i, 'FullName') || '',
      itemType: 'Inventory',
      isActive: extractTag(i, 'IsActive') === 'true',
      description: extractTag(i, 'SalesDesc') || undefined,
      price: extractTag(i, 'SalesPrice') ? parseFloat(extractTag(i, 'SalesPrice')!) : undefined,
    });
  });

  // Parse non-inventory items
  const nonInventoryRets = extractAllFullTags(responseXml, 'ItemNonInventoryRet');
  nonInventoryRets.forEach((n) => {
    items.push({
      listID: extractTag(n, 'ListID') || '',
      name: extractTag(n, 'Name') || '',
      fullName: extractTag(n, 'FullName') || '',
      itemType: 'NonInventory',
      isActive: extractTag(n, 'IsActive') === 'true',
      description: extractTag(n, 'SalesOrPurchase/Desc') || undefined,
    });
  });

  return { success: true, data: items, statusCode, statusMessage };
}

// ============================================
// EXPENSE/ITEM LINE PARSERS
// ============================================

function parseExpenseLines(txnXml: string): QBExpenseLine[] {
  const expenseRets = extractAllFullTags(txnXml, 'ExpenseLineRet');
  return expenseRets.map((e) => {
    const accountRef = extractFullTag(e, 'AccountRef');
    const customerRef = extractFullTag(e, 'CustomerRef');
    const classRef = extractFullTag(e, 'ClassRef');

    return {
      accountRef: {
        listID: accountRef ? extractTag(accountRef, 'ListID') || '' : '',
        fullName: accountRef ? extractTag(accountRef, 'FullName') || '' : '',
      },
      amount: parseFloat(extractTag(e, 'Amount') || '0'),
      memo: extractTag(e, 'Memo') || undefined,
      customerRef: customerRef
        ? {
            listID: extractTag(customerRef, 'ListID') || '',
            fullName: extractTag(customerRef, 'FullName') || '',
          }
        : undefined,
      classRef: classRef
        ? {
            listID: extractTag(classRef, 'ListID') || '',
            fullName: extractTag(classRef, 'FullName') || '',
          }
        : undefined,
      billableStatus: extractTag(e, 'BillableStatus') as QBExpenseLine['billableStatus'],
    };
  });
}

function parseItemLines(txnXml: string): QBItemLine[] {
  const itemRets = extractAllFullTags(txnXml, 'ItemLineRet');
  return itemRets.map((i) => {
    const itemRef = extractFullTag(i, 'ItemRef');
    const customerRef = extractFullTag(i, 'CustomerRef');
    const classRef = extractFullTag(i, 'ClassRef');

    return {
      itemRef: {
        listID: itemRef ? extractTag(itemRef, 'ListID') || '' : '',
        fullName: itemRef ? extractTag(itemRef, 'FullName') || '' : '',
      },
      quantity: extractTag(i, 'Quantity') ? parseFloat(extractTag(i, 'Quantity')!) : undefined,
      rate: extractTag(i, 'Rate') ? parseFloat(extractTag(i, 'Rate')!) : undefined,
      amount: parseFloat(extractTag(i, 'Amount') || '0'),
      description: extractTag(i, 'Desc') || undefined,
      customerRef: customerRef
        ? {
            listID: extractTag(customerRef, 'ListID') || '',
            fullName: extractTag(customerRef, 'FullName') || '',
          }
        : undefined,
      classRef: classRef
        ? {
            listID: extractTag(classRef, 'ListID') || '',
            fullName: extractTag(classRef, 'FullName') || '',
          }
        : undefined,
    };
  });
}

// ============================================
// CHECK PARSER
// ============================================

export function parseCheckQueryResponse(xml: string): QBXMLParseResult<QBCheck[]> {
  const responseXml = extractFullTag(xml, 'CheckQueryRs');
  if (!responseXml) {
    return {
      success: false,
      statusCode: 'ParseError',
      statusMessage: 'Could not find CheckQueryRs in response',
    };
  }

  const { statusCode, statusMessage } = parseResponseStatus(responseXml);

  if (!isSuccessStatus(statusCode)) {
    return { success: false, statusCode, statusMessage };
  }

  const checkRets = extractAllFullTags(responseXml, 'CheckRet');
  const checks: QBCheck[] = checkRets.map((c) => {
    const accountRef = extractFullTag(c, 'AccountRef');
    const payeeRef = extractFullTag(c, 'PayeeEntityRef');

    return {
      txnID: extractTag(c, 'TxnID') || '',
      txnNumber: extractTag(c, 'TxnNumber') || undefined,
      txnDate: extractTag(c, 'TxnDate') || '',
      amount: parseFloat(extractTag(c, 'Amount') || '0'),
      accountRef: {
        listID: accountRef ? extractTag(accountRef, 'ListID') || '' : '',
        fullName: accountRef ? extractTag(accountRef, 'FullName') || '' : '',
      },
      payeeRef: payeeRef
        ? {
            listID: extractTag(payeeRef, 'ListID') || '',
            fullName: extractTag(payeeRef, 'FullName') || '',
          }
        : undefined,
      memo: extractTag(c, 'Memo') || undefined,
      refNumber: extractTag(c, 'RefNumber') || undefined,
      expenseLines: parseExpenseLines(c),
      itemLines: parseItemLines(c),
      isToBePrinted: extractTag(c, 'IsToBePrinted') === 'true',
      editSequence: extractTag(c, 'EditSequence') || '',
    };
  });

  return { success: true, data: checks, statusCode, statusMessage };
}

// ============================================
// BILL PARSER
// ============================================

export function parseBillQueryResponse(xml: string): QBXMLParseResult<QBBill[]> {
  const responseXml = extractFullTag(xml, 'BillQueryRs');
  if (!responseXml) {
    return {
      success: false,
      statusCode: 'ParseError',
      statusMessage: 'Could not find BillQueryRs in response',
    };
  }

  const { statusCode, statusMessage } = parseResponseStatus(responseXml);

  if (!isSuccessStatus(statusCode)) {
    return { success: false, statusCode, statusMessage };
  }

  const billRets = extractAllFullTags(responseXml, 'BillRet');
  const bills: QBBill[] = billRets.map((b) => {
    const vendorRef = extractFullTag(b, 'VendorRef');
    const apAccountRef = extractFullTag(b, 'APAccountRef');

    return {
      txnID: extractTag(b, 'TxnID') || '',
      txnNumber: extractTag(b, 'TxnNumber') || undefined,
      txnDate: extractTag(b, 'TxnDate') || '',
      dueDate: extractTag(b, 'DueDate') || undefined,
      amount: parseFloat(extractTag(b, 'Amount') || '0'),
      amountDue: extractTag(b, 'AmountDue') ? parseFloat(extractTag(b, 'AmountDue')!) : undefined,
      vendorRef: {
        listID: vendorRef ? extractTag(vendorRef, 'ListID') || '' : '',
        fullName: vendorRef ? extractTag(vendorRef, 'FullName') || '' : '',
      },
      apAccountRef: apAccountRef
        ? {
            listID: extractTag(apAccountRef, 'ListID') || '',
            fullName: extractTag(apAccountRef, 'FullName') || '',
          }
        : undefined,
      memo: extractTag(b, 'Memo') || undefined,
      refNumber: extractTag(b, 'RefNumber') || undefined,
      expenseLines: parseExpenseLines(b),
      itemLines: parseItemLines(b),
      isPaid: extractTag(b, 'IsPaid') === 'true',
      editSequence: extractTag(b, 'EditSequence') || '',
    };
  });

  return { success: true, data: bills, statusCode, statusMessage };
}

// ============================================
// CREDIT CARD CHARGE PARSER
// ============================================

export function parseCreditCardChargeQueryResponse(xml: string): QBXMLParseResult<QBCreditCardCharge[]> {
  const responseXml = extractFullTag(xml, 'CreditCardChargeQueryRs');
  if (!responseXml) {
    return {
      success: false,
      statusCode: 'ParseError',
      statusMessage: 'Could not find CreditCardChargeQueryRs in response',
    };
  }

  const { statusCode, statusMessage } = parseResponseStatus(responseXml);

  if (!isSuccessStatus(statusCode)) {
    return { success: false, statusCode, statusMessage };
  }

  const chargeRets = extractAllFullTags(responseXml, 'CreditCardChargeRet');
  const charges: QBCreditCardCharge[] = chargeRets.map((c) => {
    const accountRef = extractFullTag(c, 'AccountRef');
    const payeeRef = extractFullTag(c, 'PayeeEntityRef');

    return {
      txnID: extractTag(c, 'TxnID') || '',
      txnDate: extractTag(c, 'TxnDate') || '',
      amount: parseFloat(extractTag(c, 'Amount') || '0'),
      accountRef: {
        listID: accountRef ? extractTag(accountRef, 'ListID') || '' : '',
        fullName: accountRef ? extractTag(accountRef, 'FullName') || '' : '',
      },
      payeeRef: payeeRef
        ? {
            listID: extractTag(payeeRef, 'ListID') || '',
            fullName: extractTag(payeeRef, 'FullName') || '',
          }
        : undefined,
      memo: extractTag(c, 'Memo') || undefined,
      refNumber: extractTag(c, 'RefNumber') || undefined,
      expenseLines: parseExpenseLines(c),
      itemLines: parseItemLines(c),
      editSequence: extractTag(c, 'EditSequence') || '',
    };
  });

  return { success: true, data: charges, statusCode, statusMessage };
}

// ============================================
// ADD RESPONSE PARSERS
// ============================================

export function parseCheckAddResponse(xml: string): QBXMLParseResult<QBCheck> {
  const responseXml = extractFullTag(xml, 'CheckAddRs');
  if (!responseXml) {
    return {
      success: false,
      statusCode: 'ParseError',
      statusMessage: 'Could not find CheckAddRs in response',
    };
  }

  const { statusCode, statusMessage } = parseResponseStatus(responseXml);

  if (!isSuccessStatus(statusCode)) {
    return { success: false, statusCode, statusMessage };
  }

  const checkRet = extractFullTag(responseXml, 'CheckRet');
  if (!checkRet) {
    return {
      success: false,
      statusCode: 'ParseError',
      statusMessage: 'Could not find CheckRet in response',
    };
  }

  const accountRef = extractFullTag(checkRet, 'AccountRef');
  const payeeRef = extractFullTag(checkRet, 'PayeeEntityRef');

  const check: QBCheck = {
    txnID: extractTag(checkRet, 'TxnID') || '',
    txnNumber: extractTag(checkRet, 'TxnNumber') || undefined,
    txnDate: extractTag(checkRet, 'TxnDate') || '',
    amount: parseFloat(extractTag(checkRet, 'Amount') || '0'),
    accountRef: {
      listID: accountRef ? extractTag(accountRef, 'ListID') || '' : '',
      fullName: accountRef ? extractTag(accountRef, 'FullName') || '' : '',
    },
    payeeRef: payeeRef
      ? {
          listID: extractTag(payeeRef, 'ListID') || '',
          fullName: extractTag(payeeRef, 'FullName') || '',
        }
      : undefined,
    memo: extractTag(checkRet, 'Memo') || undefined,
    refNumber: extractTag(checkRet, 'RefNumber') || undefined,
    expenseLines: parseExpenseLines(checkRet),
    itemLines: parseItemLines(checkRet),
    editSequence: extractTag(checkRet, 'EditSequence') || '',
  };

  return { success: true, data: check, statusCode, statusMessage };
}

export function parseBillAddResponse(xml: string): QBXMLParseResult<QBBill> {
  const responseXml = extractFullTag(xml, 'BillAddRs');
  if (!responseXml) {
    return {
      success: false,
      statusCode: 'ParseError',
      statusMessage: 'Could not find BillAddRs in response',
    };
  }

  const { statusCode, statusMessage } = parseResponseStatus(responseXml);

  if (!isSuccessStatus(statusCode)) {
    return { success: false, statusCode, statusMessage };
  }

  const billRet = extractFullTag(responseXml, 'BillRet');
  if (!billRet) {
    return {
      success: false,
      statusCode: 'ParseError',
      statusMessage: 'Could not find BillRet in response',
    };
  }

  const vendorRef = extractFullTag(billRet, 'VendorRef');

  const bill: QBBill = {
    txnID: extractTag(billRet, 'TxnID') || '',
    txnNumber: extractTag(billRet, 'TxnNumber') || undefined,
    txnDate: extractTag(billRet, 'TxnDate') || '',
    dueDate: extractTag(billRet, 'DueDate') || undefined,
    amount: parseFloat(extractTag(billRet, 'Amount') || '0'),
    vendorRef: {
      listID: vendorRef ? extractTag(vendorRef, 'ListID') || '' : '',
      fullName: vendorRef ? extractTag(vendorRef, 'FullName') || '' : '',
    },
    memo: extractTag(billRet, 'Memo') || undefined,
    refNumber: extractTag(billRet, 'RefNumber') || undefined,
    expenseLines: parseExpenseLines(billRet),
    itemLines: parseItemLines(billRet),
    editSequence: extractTag(billRet, 'EditSequence') || '',
  };

  return { success: true, data: bill, statusCode, statusMessage };
}

export function parseCreditCardChargeAddResponse(xml: string): QBXMLParseResult<QBCreditCardCharge> {
  const responseXml = extractFullTag(xml, 'CreditCardChargeAddRs');
  if (!responseXml) {
    return {
      success: false,
      statusCode: 'ParseError',
      statusMessage: 'Could not find CreditCardChargeAddRs in response',
    };
  }

  const { statusCode, statusMessage } = parseResponseStatus(responseXml);

  if (!isSuccessStatus(statusCode)) {
    return { success: false, statusCode, statusMessage };
  }

  const chargeRet = extractFullTag(responseXml, 'CreditCardChargeRet');
  if (!chargeRet) {
    return {
      success: false,
      statusCode: 'ParseError',
      statusMessage: 'Could not find CreditCardChargeRet in response',
    };
  }

  const accountRef = extractFullTag(chargeRet, 'AccountRef');
  const payeeRef = extractFullTag(chargeRet, 'PayeeEntityRef');

  const charge: QBCreditCardCharge = {
    txnID: extractTag(chargeRet, 'TxnID') || '',
    txnDate: extractTag(chargeRet, 'TxnDate') || '',
    amount: parseFloat(extractTag(chargeRet, 'Amount') || '0'),
    accountRef: {
      listID: accountRef ? extractTag(accountRef, 'ListID') || '' : '',
      fullName: accountRef ? extractTag(accountRef, 'FullName') || '' : '',
    },
    payeeRef: payeeRef
      ? {
          listID: extractTag(payeeRef, 'ListID') || '',
          fullName: extractTag(payeeRef, 'FullName') || '',
        }
      : undefined,
    memo: extractTag(chargeRet, 'Memo') || undefined,
    refNumber: extractTag(chargeRet, 'RefNumber') || undefined,
    expenseLines: parseExpenseLines(chargeRet),
    itemLines: parseItemLines(chargeRet),
    editSequence: extractTag(chargeRet, 'EditSequence') || '',
  };

  return { success: true, data: charge, statusCode, statusMessage };
}

// ============================================
// HOST/COMPANY INFO PARSERS
// ============================================

export interface QBHostInfo {
  productName: string;
  majorVersion: string;
  minorVersion: string;
  country: string;
  supportedQBXMLVersion: string[];
}

export function parseHostQueryResponse(xml: string): QBXMLParseResult<QBHostInfo> {
  const responseXml = extractFullTag(xml, 'HostQueryRs');
  if (!responseXml) {
    return {
      success: false,
      statusCode: 'ParseError',
      statusMessage: 'Could not find HostQueryRs in response',
    };
  }

  const { statusCode, statusMessage } = parseResponseStatus(responseXml);

  if (!isSuccessStatus(statusCode)) {
    return { success: false, statusCode, statusMessage };
  }

  const hostRet = extractFullTag(responseXml, 'HostRet');
  if (!hostRet) {
    return {
      success: false,
      statusCode: 'ParseError',
      statusMessage: 'Could not find HostRet in response',
    };
  }

  const supportedVersions = extractAllTags(hostRet, 'SupportedQBXMLVersion');

  const hostInfo: QBHostInfo = {
    productName: extractTag(hostRet, 'ProductName') || '',
    majorVersion: extractTag(hostRet, 'MajorVersion') || '',
    minorVersion: extractTag(hostRet, 'MinorVersion') || '',
    country: extractTag(hostRet, 'Country') || '',
    supportedQBXMLVersion: supportedVersions,
  };

  return { success: true, data: hostInfo, statusCode, statusMessage };
}

export interface QBCompanyInfo {
  companyName: string;
  legalCompanyName?: string;
  address?: {
    addr1?: string;
    addr2?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
  };
  phone?: string;
  email?: string;
  fiscalYearStartMonth?: number;
}

export function parseCompanyQueryResponse(xml: string): QBXMLParseResult<QBCompanyInfo> {
  const responseXml = extractFullTag(xml, 'CompanyQueryRs');
  if (!responseXml) {
    return {
      success: false,
      statusCode: 'ParseError',
      statusMessage: 'Could not find CompanyQueryRs in response',
    };
  }

  const { statusCode, statusMessage } = parseResponseStatus(responseXml);

  if (!isSuccessStatus(statusCode)) {
    return { success: false, statusCode, statusMessage };
  }

  const companyRet = extractFullTag(responseXml, 'CompanyRet');
  if (!companyRet) {
    return {
      success: false,
      statusCode: 'ParseError',
      statusMessage: 'Could not find CompanyRet in response',
    };
  }

  const addressBlock = extractFullTag(companyRet, 'Address');

  const companyInfo: QBCompanyInfo = {
    companyName: extractTag(companyRet, 'CompanyName') || '',
    legalCompanyName: extractTag(companyRet, 'LegalCompanyName') || undefined,
    address: addressBlock
      ? {
          addr1: extractTag(addressBlock, 'Addr1') || undefined,
          addr2: extractTag(addressBlock, 'Addr2') || undefined,
          city: extractTag(addressBlock, 'City') || undefined,
          state: extractTag(addressBlock, 'State') || undefined,
          postalCode: extractTag(addressBlock, 'PostalCode') || undefined,
          country: extractTag(addressBlock, 'Country') || undefined,
        }
      : undefined,
    phone: extractTag(companyRet, 'Phone') || undefined,
    email: extractTag(companyRet, 'Email') || undefined,
    fiscalYearStartMonth: extractTag(companyRet, 'FirstMonthFiscalYear')
      ? parseInt(extractTag(companyRet, 'FirstMonthFiscalYear')!)
      : undefined,
  };

  return { success: true, data: companyInfo, statusCode, statusMessage };
}
