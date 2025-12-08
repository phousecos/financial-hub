// lib/qbxml/builder.ts - QBXML Request Builder

import type { QBExpenseLine, QBItemLine } from './types';

// QBXML version we're targeting
const QBXML_VERSION = '13.0';

/**
 * Wraps content in QBXML envelope
 */
export function wrapQBXML(content: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<?qbxml version="${QBXML_VERSION}"?>
<QBXML>
<QBXMLMsgsRq onError="stopOnError">
${content}
</QBXMLMsgsRq>
</QBXML>`;
}

/**
 * Escapes special XML characters
 */
export function escapeXML(str: string | undefined | null): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Formats a date for QBXML (YYYY-MM-DD)
 */
export function formatQBDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toISOString().split('T')[0];
}

/**
 * Formats amount for QBXML (no currency symbol, 2 decimal places)
 */
export function formatQBAmount(amount: number): string {
  return Math.abs(amount).toFixed(2);
}

// ============================================
// QUERY BUILDERS
// ============================================

/**
 * Build VendorQuery request
 */
export function buildVendorQuery(options?: {
  listID?: string;
  fullName?: string;
  activeStatus?: 'ActiveOnly' | 'InactiveOnly' | 'All';
  fromModifiedDate?: string;
  maxReturned?: number;
}): string {
  const filters: string[] = [];

  if (options?.listID) {
    filters.push(`<ListID>${escapeXML(options.listID)}</ListID>`);
  }
  if (options?.fullName) {
    filters.push(`<FullName>${escapeXML(options.fullName)}</FullName>`);
  }
  if (options?.activeStatus) {
    filters.push(`<ActiveStatus>${options.activeStatus}</ActiveStatus>`);
  }
  if (options?.fromModifiedDate) {
    filters.push(`<FromModifiedDate>${options.fromModifiedDate}</FromModifiedDate>`);
  }
  if (options?.maxReturned) {
    filters.push(`<MaxReturned>${options.maxReturned}</MaxReturned>`);
  }

  return wrapQBXML(`
<VendorQueryRq requestID="1">
${filters.join('\n')}
</VendorQueryRq>`);
}

/**
 * Build CustomerQuery request
 */
export function buildCustomerQuery(options?: {
  listID?: string;
  fullName?: string;
  activeStatus?: 'ActiveOnly' | 'InactiveOnly' | 'All';
  fromModifiedDate?: string;
  maxReturned?: number;
}): string {
  const filters: string[] = [];

  if (options?.listID) {
    filters.push(`<ListID>${escapeXML(options.listID)}</ListID>`);
  }
  if (options?.fullName) {
    filters.push(`<FullName>${escapeXML(options.fullName)}</FullName>`);
  }
  if (options?.activeStatus) {
    filters.push(`<ActiveStatus>${options.activeStatus}</ActiveStatus>`);
  }
  if (options?.fromModifiedDate) {
    filters.push(`<FromModifiedDate>${options.fromModifiedDate}</FromModifiedDate>`);
  }
  if (options?.maxReturned) {
    filters.push(`<MaxReturned>${options.maxReturned}</MaxReturned>`);
  }

  return wrapQBXML(`
<CustomerQueryRq requestID="1">
${filters.join('\n')}
</CustomerQueryRq>`);
}

/**
 * Build AccountQuery request
 */
export function buildAccountQuery(options?: {
  listID?: string;
  fullName?: string;
  accountType?: string;
  activeStatus?: 'ActiveOnly' | 'InactiveOnly' | 'All';
  maxReturned?: number;
}): string {
  const filters: string[] = [];

  if (options?.listID) {
    filters.push(`<ListID>${escapeXML(options.listID)}</ListID>`);
  }
  if (options?.fullName) {
    filters.push(`<FullName>${escapeXML(options.fullName)}</FullName>`);
  }
  if (options?.accountType) {
    filters.push(`<AccountType>${options.accountType}</AccountType>`);
  }
  if (options?.activeStatus) {
    filters.push(`<ActiveStatus>${options.activeStatus}</ActiveStatus>`);
  }
  if (options?.maxReturned) {
    filters.push(`<MaxReturned>${options.maxReturned}</MaxReturned>`);
  }

  return wrapQBXML(`
<AccountQueryRq requestID="1">
${filters.join('\n')}
</AccountQueryRq>`);
}

/**
 * Build ItemQuery request (for service/inventory items)
 */
export function buildItemQuery(options?: {
  listID?: string;
  fullName?: string;
  activeStatus?: 'ActiveOnly' | 'InactiveOnly' | 'All';
  maxReturned?: number;
}): string {
  const filters: string[] = [];

  if (options?.listID) {
    filters.push(`<ListID>${escapeXML(options.listID)}</ListID>`);
  }
  if (options?.fullName) {
    filters.push(`<FullName>${escapeXML(options.fullName)}</FullName>`);
  }
  if (options?.activeStatus) {
    filters.push(`<ActiveStatus>${options.activeStatus}</ActiveStatus>`);
  }
  if (options?.maxReturned) {
    filters.push(`<MaxReturned>${options.maxReturned}</MaxReturned>`);
  }

  return wrapQBXML(`
<ItemQueryRq requestID="1">
${filters.join('\n')}
</ItemQueryRq>`);
}

/**
 * Build CheckQuery request
 */
export function buildCheckQuery(options?: {
  txnID?: string;
  refNumber?: string;
  accountFullName?: string;
  payeeFullName?: string;
  fromTxnDate?: string;
  toTxnDate?: string;
  fromModifiedDate?: string;
  toModifiedDate?: string;
  includeLineItems?: boolean;
  maxReturned?: number;
}): string {
  const filters: string[] = [];

  if (options?.txnID) {
    filters.push(`<TxnID>${escapeXML(options.txnID)}</TxnID>`);
  }
  if (options?.refNumber) {
    filters.push(`<RefNumber>${escapeXML(options.refNumber)}</RefNumber>`);
  }
  if (options?.accountFullName) {
    filters.push(`<AccountFilter><FullName>${escapeXML(options.accountFullName)}</FullName></AccountFilter>`);
  }
  if (options?.payeeFullName) {
    filters.push(`<EntityFilter><FullName>${escapeXML(options.payeeFullName)}</FullName></EntityFilter>`);
  }
  if (options?.fromTxnDate || options?.toTxnDate) {
    let dateFilter = '<TxnDateRangeFilter>';
    if (options?.fromTxnDate) dateFilter += `<FromTxnDate>${options.fromTxnDate}</FromTxnDate>`;
    if (options?.toTxnDate) dateFilter += `<ToTxnDate>${options.toTxnDate}</ToTxnDate>`;
    dateFilter += '</TxnDateRangeFilter>';
    filters.push(dateFilter);
  }
  if (options?.fromModifiedDate || options?.toModifiedDate) {
    let modFilter = '<ModifiedDateRangeFilter>';
    if (options?.fromModifiedDate) modFilter += `<FromModifiedDate>${options.fromModifiedDate}</FromModifiedDate>`;
    if (options?.toModifiedDate) modFilter += `<ToModifiedDate>${options.toModifiedDate}</ToModifiedDate>`;
    modFilter += '</ModifiedDateRangeFilter>';
    filters.push(modFilter);
  }
  if (options?.includeLineItems !== false) {
    filters.push('<IncludeLineItems>true</IncludeLineItems>');
  }
  if (options?.maxReturned) {
    filters.push(`<MaxReturned>${options.maxReturned}</MaxReturned>`);
  }

  return wrapQBXML(`
<CheckQueryRq requestID="1">
${filters.join('\n')}
</CheckQueryRq>`);
}

/**
 * Build BillQuery request
 */
export function buildBillQuery(options?: {
  txnID?: string;
  refNumber?: string;
  vendorFullName?: string;
  fromTxnDate?: string;
  toTxnDate?: string;
  fromModifiedDate?: string;
  toModifiedDate?: string;
  paidStatus?: 'All' | 'PaidOnly' | 'NotPaidOnly';
  includeLineItems?: boolean;
  maxReturned?: number;
}): string {
  const filters: string[] = [];

  if (options?.txnID) {
    filters.push(`<TxnID>${escapeXML(options.txnID)}</TxnID>`);
  }
  if (options?.refNumber) {
    filters.push(`<RefNumber>${escapeXML(options.refNumber)}</RefNumber>`);
  }
  if (options?.vendorFullName) {
    filters.push(`<EntityFilter><FullName>${escapeXML(options.vendorFullName)}</FullName></EntityFilter>`);
  }
  if (options?.fromTxnDate || options?.toTxnDate) {
    let dateFilter = '<TxnDateRangeFilter>';
    if (options?.fromTxnDate) dateFilter += `<FromTxnDate>${options.fromTxnDate}</FromTxnDate>`;
    if (options?.toTxnDate) dateFilter += `<ToTxnDate>${options.toTxnDate}</ToTxnDate>`;
    dateFilter += '</TxnDateRangeFilter>';
    filters.push(dateFilter);
  }
  if (options?.fromModifiedDate || options?.toModifiedDate) {
    let modFilter = '<ModifiedDateRangeFilter>';
    if (options?.fromModifiedDate) modFilter += `<FromModifiedDate>${options.fromModifiedDate}</FromModifiedDate>`;
    if (options?.toModifiedDate) modFilter += `<ToModifiedDate>${options.toModifiedDate}</ToModifiedDate>`;
    modFilter += '</ModifiedDateRangeFilter>';
    filters.push(modFilter);
  }
  if (options?.paidStatus) {
    filters.push(`<PaidStatus>${options.paidStatus}</PaidStatus>`);
  }
  if (options?.includeLineItems !== false) {
    filters.push('<IncludeLineItems>true</IncludeLineItems>');
  }
  if (options?.maxReturned) {
    filters.push(`<MaxReturned>${options.maxReturned}</MaxReturned>`);
  }

  return wrapQBXML(`
<BillQueryRq requestID="1">
${filters.join('\n')}
</BillQueryRq>`);
}

/**
 * Build CreditCardChargeQuery request
 */
export function buildCreditCardChargeQuery(options?: {
  txnID?: string;
  refNumber?: string;
  accountFullName?: string;
  payeeFullName?: string;
  fromTxnDate?: string;
  toTxnDate?: string;
  fromModifiedDate?: string;
  toModifiedDate?: string;
  includeLineItems?: boolean;
  maxReturned?: number;
}): string {
  const filters: string[] = [];

  if (options?.txnID) {
    filters.push(`<TxnID>${escapeXML(options.txnID)}</TxnID>`);
  }
  if (options?.refNumber) {
    filters.push(`<RefNumber>${escapeXML(options.refNumber)}</RefNumber>`);
  }
  if (options?.accountFullName) {
    filters.push(`<AccountFilter><FullName>${escapeXML(options.accountFullName)}</FullName></AccountFilter>`);
  }
  if (options?.payeeFullName) {
    filters.push(`<EntityFilter><FullName>${escapeXML(options.payeeFullName)}</FullName></EntityFilter>`);
  }
  if (options?.fromTxnDate || options?.toTxnDate) {
    let dateFilter = '<TxnDateRangeFilter>';
    if (options?.fromTxnDate) dateFilter += `<FromTxnDate>${options.fromTxnDate}</FromTxnDate>`;
    if (options?.toTxnDate) dateFilter += `<ToTxnDate>${options.toTxnDate}</ToTxnDate>`;
    dateFilter += '</TxnDateRangeFilter>';
    filters.push(dateFilter);
  }
  if (options?.fromModifiedDate || options?.toModifiedDate) {
    let modFilter = '<ModifiedDateRangeFilter>';
    if (options?.fromModifiedDate) modFilter += `<FromModifiedDate>${options.fromModifiedDate}</FromModifiedDate>`;
    if (options?.toModifiedDate) modFilter += `<ToModifiedDate>${options.toModifiedDate}</ToModifiedDate>`;
    modFilter += '</ModifiedDateRangeFilter>';
    filters.push(modFilter);
  }
  if (options?.includeLineItems !== false) {
    filters.push('<IncludeLineItems>true</IncludeLineItems>');
  }
  if (options?.maxReturned) {
    filters.push(`<MaxReturned>${options.maxReturned}</MaxReturned>`);
  }

  return wrapQBXML(`
<CreditCardChargeQueryRq requestID="1">
${filters.join('\n')}
</CreditCardChargeQueryRq>`);
}

// ============================================
// ADD TRANSACTION BUILDERS
// ============================================

/**
 * Build expense line XML
 */
function buildExpenseLineXML(line: QBExpenseLine): string {
  let xml = '<ExpenseLineAdd>';
  xml += `<AccountRef><FullName>${escapeXML(line.accountRef.fullName)}</FullName></AccountRef>`;
  xml += `<Amount>${formatQBAmount(line.amount)}</Amount>`;
  if (line.memo) xml += `<Memo>${escapeXML(line.memo)}</Memo>`;
  if (line.customerRef) {
    xml += `<CustomerRef><FullName>${escapeXML(line.customerRef.fullName)}</FullName></CustomerRef>`;
  }
  if (line.classRef) {
    xml += `<ClassRef><FullName>${escapeXML(line.classRef.fullName)}</FullName></ClassRef>`;
  }
  if (line.billableStatus) {
    xml += `<BillableStatus>${line.billableStatus}</BillableStatus>`;
  }
  xml += '</ExpenseLineAdd>';
  return xml;
}

/**
 * Build item line XML
 */
function buildItemLineXML(line: QBItemLine): string {
  let xml = '<ItemLineAdd>';
  xml += `<ItemRef><FullName>${escapeXML(line.itemRef.fullName)}</FullName></ItemRef>`;
  if (line.description) xml += `<Desc>${escapeXML(line.description)}</Desc>`;
  if (line.quantity !== undefined) xml += `<Quantity>${line.quantity}</Quantity>`;
  if (line.rate !== undefined) xml += `<Rate>${formatQBAmount(line.rate)}</Rate>`;
  if (line.amount !== undefined) xml += `<Amount>${formatQBAmount(line.amount)}</Amount>`;
  if (line.customerRef) {
    xml += `<CustomerRef><FullName>${escapeXML(line.customerRef.fullName)}</FullName></CustomerRef>`;
  }
  if (line.classRef) {
    xml += `<ClassRef><FullName>${escapeXML(line.classRef.fullName)}</FullName></ClassRef>`;
  }
  xml += '</ItemLineAdd>';
  return xml;
}

/**
 * Build CheckAdd request
 */
export function buildCheckAdd(check: {
  accountFullName: string;
  payeeFullName?: string;
  txnDate: string;
  refNumber?: string;
  memo?: string;
  isToBePrinted?: boolean;
  expenseLines?: QBExpenseLine[];
  itemLines?: QBItemLine[];
}): string {
  let xml = '<CheckAddRq requestID="1"><CheckAdd>';

  xml += `<AccountRef><FullName>${escapeXML(check.accountFullName)}</FullName></AccountRef>`;

  if (check.payeeFullName) {
    xml += `<PayeeEntityRef><FullName>${escapeXML(check.payeeFullName)}</FullName></PayeeEntityRef>`;
  }

  xml += `<TxnDate>${check.txnDate}</TxnDate>`;

  if (check.refNumber) {
    xml += `<RefNumber>${escapeXML(check.refNumber)}</RefNumber>`;
  }

  if (check.memo) {
    xml += `<Memo>${escapeXML(check.memo)}</Memo>`;
  }

  if (check.isToBePrinted !== undefined) {
    xml += `<IsToBePrinted>${check.isToBePrinted}</IsToBePrinted>`;
  }

  // Add expense lines
  if (check.expenseLines && check.expenseLines.length > 0) {
    check.expenseLines.forEach(line => {
      xml += buildExpenseLineXML(line);
    });
  }

  // Add item lines
  if (check.itemLines && check.itemLines.length > 0) {
    check.itemLines.forEach(line => {
      xml += buildItemLineXML(line);
    });
  }

  xml += '</CheckAdd></CheckAddRq>';

  return wrapQBXML(xml);
}

/**
 * Build BillAdd request
 */
export function buildBillAdd(bill: {
  vendorFullName: string;
  txnDate: string;
  dueDate?: string;
  refNumber?: string;
  memo?: string;
  apAccountFullName?: string;
  expenseLines?: QBExpenseLine[];
  itemLines?: QBItemLine[];
}): string {
  let xml = '<BillAddRq requestID="1"><BillAdd>';

  xml += `<VendorRef><FullName>${escapeXML(bill.vendorFullName)}</FullName></VendorRef>`;
  xml += `<TxnDate>${bill.txnDate}</TxnDate>`;

  if (bill.dueDate) {
    xml += `<DueDate>${bill.dueDate}</DueDate>`;
  }

  if (bill.refNumber) {
    xml += `<RefNumber>${escapeXML(bill.refNumber)}</RefNumber>`;
  }

  if (bill.apAccountFullName) {
    xml += `<APAccountRef><FullName>${escapeXML(bill.apAccountFullName)}</FullName></APAccountRef>`;
  }

  if (bill.memo) {
    xml += `<Memo>${escapeXML(bill.memo)}</Memo>`;
  }

  // Add expense lines
  if (bill.expenseLines && bill.expenseLines.length > 0) {
    bill.expenseLines.forEach(line => {
      xml += buildExpenseLineXML(line);
    });
  }

  // Add item lines
  if (bill.itemLines && bill.itemLines.length > 0) {
    bill.itemLines.forEach(line => {
      xml += buildItemLineXML(line);
    });
  }

  xml += '</BillAdd></BillAddRq>';

  return wrapQBXML(xml);
}

/**
 * Build CreditCardChargeAdd request
 */
export function buildCreditCardChargeAdd(charge: {
  accountFullName: string;
  payeeFullName?: string;
  txnDate: string;
  refNumber?: string;
  memo?: string;
  expenseLines?: QBExpenseLine[];
  itemLines?: QBItemLine[];
}): string {
  let xml = '<CreditCardChargeAddRq requestID="1"><CreditCardChargeAdd>';

  xml += `<AccountRef><FullName>${escapeXML(charge.accountFullName)}</FullName></AccountRef>`;

  if (charge.payeeFullName) {
    xml += `<PayeeEntityRef><FullName>${escapeXML(charge.payeeFullName)}</FullName></PayeeEntityRef>`;
  }

  xml += `<TxnDate>${charge.txnDate}</TxnDate>`;

  if (charge.refNumber) {
    xml += `<RefNumber>${escapeXML(charge.refNumber)}</RefNumber>`;
  }

  if (charge.memo) {
    xml += `<Memo>${escapeXML(charge.memo)}</Memo>`;
  }

  // Add expense lines
  if (charge.expenseLines && charge.expenseLines.length > 0) {
    charge.expenseLines.forEach(line => {
      xml += buildExpenseLineXML(line);
    });
  }

  // Add item lines
  if (charge.itemLines && charge.itemLines.length > 0) {
    charge.itemLines.forEach(line => {
      xml += buildItemLineXML(line);
    });
  }

  xml += '</CreditCardChargeAdd></CreditCardChargeAddRq>';

  return wrapQBXML(xml);
}

// ============================================
// MODIFY TRANSACTION BUILDERS
// ============================================

/**
 * Build CheckMod request (to update existing check)
 */
export function buildCheckMod(mod: {
  txnID: string;
  editSequence: string;
  accountFullName?: string;
  payeeFullName?: string;
  txnDate?: string;
  refNumber?: string;
  memo?: string;
}): string {
  let xml = '<CheckModRq requestID="1"><CheckMod>';

  xml += `<TxnID>${escapeXML(mod.txnID)}</TxnID>`;
  xml += `<EditSequence>${escapeXML(mod.editSequence)}</EditSequence>`;

  if (mod.accountFullName) {
    xml += `<AccountRef><FullName>${escapeXML(mod.accountFullName)}</FullName></AccountRef>`;
  }

  if (mod.payeeFullName) {
    xml += `<PayeeEntityRef><FullName>${escapeXML(mod.payeeFullName)}</FullName></PayeeEntityRef>`;
  }

  if (mod.txnDate) {
    xml += `<TxnDate>${mod.txnDate}</TxnDate>`;
  }

  if (mod.refNumber) {
    xml += `<RefNumber>${escapeXML(mod.refNumber)}</RefNumber>`;
  }

  if (mod.memo) {
    xml += `<Memo>${escapeXML(mod.memo)}</Memo>`;
  }

  xml += '</CheckMod></CheckModRq>';

  return wrapQBXML(xml);
}

/**
 * Build BillMod request (to update existing bill)
 */
export function buildBillMod(mod: {
  txnID: string;
  editSequence: string;
  vendorFullName?: string;
  txnDate?: string;
  dueDate?: string;
  refNumber?: string;
  memo?: string;
}): string {
  let xml = '<BillModRq requestID="1"><BillMod>';

  xml += `<TxnID>${escapeXML(mod.txnID)}</TxnID>`;
  xml += `<EditSequence>${escapeXML(mod.editSequence)}</EditSequence>`;

  if (mod.vendorFullName) {
    xml += `<VendorRef><FullName>${escapeXML(mod.vendorFullName)}</FullName></VendorRef>`;
  }

  if (mod.txnDate) {
    xml += `<TxnDate>${mod.txnDate}</TxnDate>`;
  }

  if (mod.dueDate) {
    xml += `<DueDate>${mod.dueDate}</DueDate>`;
  }

  if (mod.refNumber) {
    xml += `<RefNumber>${escapeXML(mod.refNumber)}</RefNumber>`;
  }

  if (mod.memo) {
    xml += `<Memo>${escapeXML(mod.memo)}</Memo>`;
  }

  xml += '</BillMod></BillModRq>';

  return wrapQBXML(xml);
}

// ============================================
// HOST QUERY (for connection verification)
// ============================================

/**
 * Build HostQuery request (to verify connection and get QB version)
 */
export function buildHostQuery(): string {
  return wrapQBXML('<HostQueryRq requestID="1"></HostQueryRq>');
}

/**
 * Build CompanyQuery request (to get company info)
 */
export function buildCompanyQuery(): string {
  return wrapQBXML('<CompanyQueryRq requestID="1"></CompanyQueryRq>');
}
