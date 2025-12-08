// lib/qbwc/soap-handler.ts - SOAP Request/Response Handler for QB Web Connector

import {
  createSession,
  getSession,
  getCurrentOperation,
  markOperationSent,
  completeCurrentOperation,
  closeSession,
  hasPendingOperations,
} from './session-manager';
import {
  buildVendorQuery,
  buildCustomerQuery,
  buildAccountQuery,
  buildCheckQuery,
  buildBillQuery,
  buildCreditCardChargeQuery,
  buildHostQuery,
  buildCompanyQuery,
} from '../qbxml/builder';
import type { QBOperationType } from '../qbxml/types';

// Server version
const SERVER_VERSION = '1.0.0';

// QBWC supported versions (we'll accept any)
const MIN_SUPPORTED_VERSION = '';

// Last error storage per ticket
const lastErrors = new Map<string, string>();

/**
 * Extract value from SOAP XML
 */
function extractSOAPValue(xml: string, tagName: string): string {
  const regex = new RegExp(`<[^:]*:?${tagName}[^>]*>([\\s\\S]*?)<\\/[^:]*:?${tagName}>`, 'i');
  const match = xml.match(regex);
  return match ? match[1].trim() : '';
}

/**
 * Detect which SOAP method is being called
 */
function detectSOAPMethod(xml: string): string {
  const methods = [
    'authenticate',
    'serverVersion',
    'clientVersion',
    'sendRequestXML',
    'receiveResponseXML',
    'connectionError',
    'closeConnection',
    'getLastError',
  ];

  for (const method of methods) {
    if (xml.toLowerCase().includes(method.toLowerCase())) {
      return method;
    }
  }

  return 'unknown';
}

/**
 * Create SOAP response envelope
 */
function createSOAPResponse(method: string, content: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema">
<soap:Body>
<${method}Response xmlns="http://developer.intuit.com/">
${content}
</${method}Response>
</soap:Body>
</soap:Envelope>`;
}

/**
 * Handle serverVersion request
 */
function handleServerVersion(): string {
  return createSOAPResponse('serverVersion', `<serverVersionResult>${SERVER_VERSION}</serverVersionResult>`);
}

/**
 * Handle clientVersion request
 */
function handleClientVersion(xml: string): string {
  const clientVersion = extractSOAPValue(xml, 'strVersion');
  console.log('[QBWC] Client version:', clientVersion);

  // Return empty string to accept any version, or message to display
  return createSOAPResponse('clientVersion', `<clientVersionResult>${MIN_SUPPORTED_VERSION}</clientVersionResult>`);
}

/**
 * Handle authenticate request
 * Returns [ticket, status] where status can be:
 * - "" (empty): Success, proceed with company file
 * - "none": No work to do
 * - "nvu": Invalid username/password
 * - company file path: Use this specific company file
 */
async function handleAuthenticate(
  xml: string,
  validateCredentials: (username: string, password: string) => Promise<{ valid: boolean; companyId?: string; companyFile?: string }>
): Promise<string> {
  const username = extractSOAPValue(xml, 'strUserName');
  const password = extractSOAPValue(xml, 'strPassword');

  console.log('[QBWC] Authentication attempt for user:', username);

  try {
    const result = await validateCredentials(username, password);

    if (!result.valid || !result.companyId) {
      console.log('[QBWC] Invalid credentials');
      return createSOAPResponse(
        'authenticate',
        `<authenticateResult><string>invalid</string><string>nvu</string></authenticateResult>`
      );
    }

    // Check if there's work to do
    if (!hasPendingOperations(result.companyId)) {
      console.log('[QBWC] No pending operations for company:', result.companyId);
      return createSOAPResponse(
        'authenticate',
        `<authenticateResult><string></string><string>none</string></authenticateResult>`
      );
    }

    // Create session and return ticket
    const session = createSession(result.companyId);
    console.log('[QBWC] Session created:', session.ticket, 'with', session.operations.length, 'operations');

    // If company file path is specified, return it; otherwise empty string
    const status = result.companyFile || '';

    return createSOAPResponse(
      'authenticate',
      `<authenticateResult><string>${session.ticket}</string><string>${status}</string></authenticateResult>`
    );
  } catch (error) {
    console.error('[QBWC] Authentication error:', error);
    return createSOAPResponse(
      'authenticate',
      `<authenticateResult><string></string><string>nvu</string></authenticateResult>`
    );
  }
}

/**
 * Generate QBXML request for an operation type
 */
function generateQBXMLForOperation(type: QBOperationType, data?: Record<string, unknown>): string {
  switch (type) {
    case 'query_vendors':
      return buildVendorQuery(data as Parameters<typeof buildVendorQuery>[0]);
    case 'query_customers':
      return buildCustomerQuery(data as Parameters<typeof buildCustomerQuery>[0]);
    case 'query_accounts':
      return buildAccountQuery(data as Parameters<typeof buildAccountQuery>[0]);
    case 'query_checks':
      return buildCheckQuery(data as Parameters<typeof buildCheckQuery>[0]);
    case 'query_bills':
      return buildBillQuery(data as Parameters<typeof buildBillQuery>[0]);
    case 'query_credit_cards':
      return buildCreditCardChargeQuery(data as Parameters<typeof buildCreditCardChargeQuery>[0]);
    default:
      // For host/company queries (used for connection testing)
      if (type === 'query_items') {
        return buildHostQuery();
      }
      return buildCompanyQuery();
  }
}

/**
 * Handle sendRequestXML request
 * Returns QBXML to execute, or empty string if done
 */
function handleSendRequestXML(xml: string): string {
  const ticket = extractSOAPValue(xml, 'ticket');
  const companyFileName = extractSOAPValue(xml, 'strCompanyFileName');

  console.log('[QBWC] sendRequestXML for ticket:', ticket, 'company file:', companyFileName);

  const session = getSession(ticket);
  if (!session) {
    console.log('[QBWC] No session found for ticket');
    lastErrors.set(ticket, 'Invalid session ticket');
    return createSOAPResponse('sendRequestXML', `<sendRequestXMLResult></sendRequestXMLResult>`);
  }

  const operation = getCurrentOperation(ticket);
  if (!operation) {
    console.log('[QBWC] No more operations');
    return createSOAPResponse('sendRequestXML', `<sendRequestXMLResult></sendRequestXMLResult>`);
  }

  console.log('[QBWC] Generating QBXML for operation:', operation.type);

  try {
    const qbxml = generateQBXMLForOperation(operation.type, operation.data);
    operation.request = qbxml;
    markOperationSent(ticket);

    // Escape the QBXML for SOAP response
    const escapedQbxml = qbxml
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    return createSOAPResponse('sendRequestXML', `<sendRequestXMLResult>${escapedQbxml}</sendRequestXMLResult>`);
  } catch (error) {
    console.error('[QBWC] Error generating QBXML:', error);
    lastErrors.set(ticket, `Error generating QBXML: ${error}`);
    return createSOAPResponse('sendRequestXML', `<sendRequestXMLResult></sendRequestXMLResult>`);
  }
}

/**
 * Handle receiveResponseXML request
 * Returns percentage complete (negative for error)
 */
async function handleReceiveResponseXML(
  xml: string,
  processResponse: (companyId: string, operationType: QBOperationType, response: string) => Promise<void>
): Promise<string> {
  const ticket = extractSOAPValue(xml, 'ticket');
  const response = extractSOAPValue(xml, 'response');
  const hresult = extractSOAPValue(xml, 'hresult');
  const message = extractSOAPValue(xml, 'message');

  console.log('[QBWC] receiveResponseXML for ticket:', ticket);

  const session = getSession(ticket);
  if (!session) {
    console.log('[QBWC] No session found');
    return createSOAPResponse('receiveResponseXML', `<receiveResponseXMLResult>100</receiveResponseXMLResult>`);
  }

  // Check for QB error
  if (hresult && hresult !== '0') {
    console.error('[QBWC] QB Error:', hresult, message);
    lastErrors.set(ticket, message || `QB Error: ${hresult}`);

    const { percentComplete } = completeCurrentOperation(ticket, response, message);
    return createSOAPResponse('receiveResponseXML', `<receiveResponseXMLResult>${percentComplete}</receiveResponseXMLResult>`);
  }

  // Get current operation before completing it
  const currentOp = getCurrentOperation(ticket);

  // Complete the operation
  const { percentComplete, hasMore } = completeCurrentOperation(ticket, response);

  console.log('[QBWC] Operation completed. Progress:', percentComplete, '%', hasMore ? '(more pending)' : '(done)');

  // Process the response asynchronously
  if (currentOp && response) {
    try {
      await processResponse(session.companyId, currentOp.type, response);
    } catch (error) {
      console.error('[QBWC] Error processing response:', error);
    }
  }

  return createSOAPResponse('receiveResponseXML', `<receiveResponseXMLResult>${percentComplete}</receiveResponseXMLResult>`);
}

/**
 * Handle connectionError request
 */
function handleConnectionError(xml: string): string {
  const ticket = extractSOAPValue(xml, 'ticket');
  const hresult = extractSOAPValue(xml, 'hresult');
  const message = extractSOAPValue(xml, 'message');

  console.error('[QBWC] Connection error:', hresult, message);
  lastErrors.set(ticket, message || `Connection error: ${hresult}`);

  // Return "done" to stop retrying
  return createSOAPResponse('connectionError', `<connectionErrorResult>done</connectionErrorResult>`);
}

/**
 * Handle closeConnection request
 */
function handleCloseConnection(xml: string): string {
  const ticket = extractSOAPValue(xml, 'ticket');

  console.log('[QBWC] Closing connection for ticket:', ticket);

  closeSession(ticket);
  lastErrors.delete(ticket);

  return createSOAPResponse('closeConnection', `<closeConnectionResult>OK</closeConnectionResult>`);
}

/**
 * Handle getLastError request
 */
function handleGetLastError(xml: string): string {
  const ticket = extractSOAPValue(xml, 'ticket');
  const error = lastErrors.get(ticket) || '';

  console.log('[QBWC] getLastError for ticket:', ticket, 'error:', error);

  return createSOAPResponse('getLastError', `<getLastErrorResult>${error}</getLastErrorResult>`);
}

/**
 * Main SOAP request handler
 */
export async function handleSOAPRequest(
  soapXml: string,
  callbacks: {
    validateCredentials: (username: string, password: string) => Promise<{ valid: boolean; companyId?: string; companyFile?: string }>;
    processResponse: (companyId: string, operationType: QBOperationType, response: string) => Promise<void>;
  }
): Promise<string> {
  const method = detectSOAPMethod(soapXml);

  console.log('[QBWC] Handling SOAP method:', method);

  switch (method) {
    case 'serverVersion':
      return handleServerVersion();

    case 'clientVersion':
      return handleClientVersion(soapXml);

    case 'authenticate':
      return handleAuthenticate(soapXml, callbacks.validateCredentials);

    case 'sendRequestXML':
      return handleSendRequestXML(soapXml);

    case 'receiveResponseXML':
      return handleReceiveResponseXML(soapXml, callbacks.processResponse);

    case 'connectionError':
      return handleConnectionError(soapXml);

    case 'closeConnection':
      return handleCloseConnection(soapXml);

    case 'getLastError':
      return handleGetLastError(soapXml);

    default:
      console.warn('[QBWC] Unknown SOAP method:', method);
      return createSOAPResponse('fault', `<faultcode>Client</faultcode><faultstring>Unknown method</faultstring>`);
  }
}

/**
 * Generate WSDL for QB Web Connector
 */
export function generateWSDL(serviceUrl: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<definitions xmlns:soap="http://schemas.xmlsoap.org/wsdl/soap/"
             xmlns:tns="http://developer.intuit.com/"
             xmlns:s="http://www.w3.org/2001/XMLSchema"
             xmlns:soap12="http://schemas.xmlsoap.org/wsdl/soap12/"
             xmlns="http://schemas.xmlsoap.org/wsdl/"
             targetNamespace="http://developer.intuit.com/"
             name="QBWebConnectorSvc">

  <types>
    <s:schema elementFormDefault="qualified" targetNamespace="http://developer.intuit.com/">
      <s:element name="serverVersion">
        <s:complexType />
      </s:element>
      <s:element name="serverVersionResponse">
        <s:complexType>
          <s:sequence>
            <s:element minOccurs="0" maxOccurs="1" name="serverVersionResult" type="s:string" />
          </s:sequence>
        </s:complexType>
      </s:element>
      <s:element name="clientVersion">
        <s:complexType>
          <s:sequence>
            <s:element minOccurs="0" maxOccurs="1" name="strVersion" type="s:string" />
          </s:sequence>
        </s:complexType>
      </s:element>
      <s:element name="clientVersionResponse">
        <s:complexType>
          <s:sequence>
            <s:element minOccurs="0" maxOccurs="1" name="clientVersionResult" type="s:string" />
          </s:sequence>
        </s:complexType>
      </s:element>
      <s:element name="authenticate">
        <s:complexType>
          <s:sequence>
            <s:element minOccurs="0" maxOccurs="1" name="strUserName" type="s:string" />
            <s:element minOccurs="0" maxOccurs="1" name="strPassword" type="s:string" />
          </s:sequence>
        </s:complexType>
      </s:element>
      <s:element name="authenticateResponse">
        <s:complexType>
          <s:sequence>
            <s:element minOccurs="0" maxOccurs="1" name="authenticateResult" type="tns:ArrayOfString" />
          </s:sequence>
        </s:complexType>
      </s:element>
      <s:complexType name="ArrayOfString">
        <s:sequence>
          <s:element minOccurs="0" maxOccurs="unbounded" name="string" nillable="true" type="s:string" />
        </s:sequence>
      </s:complexType>
      <s:element name="sendRequestXML">
        <s:complexType>
          <s:sequence>
            <s:element minOccurs="0" maxOccurs="1" name="ticket" type="s:string" />
            <s:element minOccurs="0" maxOccurs="1" name="strHCPResponse" type="s:string" />
            <s:element minOccurs="0" maxOccurs="1" name="strCompanyFileName" type="s:string" />
            <s:element minOccurs="0" maxOccurs="1" name="qbXMLCountry" type="s:string" />
            <s:element minOccurs="1" maxOccurs="1" name="qbXMLMajorVers" type="s:int" />
            <s:element minOccurs="1" maxOccurs="1" name="qbXMLMinorVers" type="s:int" />
          </s:sequence>
        </s:complexType>
      </s:element>
      <s:element name="sendRequestXMLResponse">
        <s:complexType>
          <s:sequence>
            <s:element minOccurs="0" maxOccurs="1" name="sendRequestXMLResult" type="s:string" />
          </s:sequence>
        </s:complexType>
      </s:element>
      <s:element name="receiveResponseXML">
        <s:complexType>
          <s:sequence>
            <s:element minOccurs="0" maxOccurs="1" name="ticket" type="s:string" />
            <s:element minOccurs="0" maxOccurs="1" name="response" type="s:string" />
            <s:element minOccurs="0" maxOccurs="1" name="hresult" type="s:string" />
            <s:element minOccurs="0" maxOccurs="1" name="message" type="s:string" />
          </s:sequence>
        </s:complexType>
      </s:element>
      <s:element name="receiveResponseXMLResponse">
        <s:complexType>
          <s:sequence>
            <s:element minOccurs="1" maxOccurs="1" name="receiveResponseXMLResult" type="s:int" />
          </s:sequence>
        </s:complexType>
      </s:element>
      <s:element name="connectionError">
        <s:complexType>
          <s:sequence>
            <s:element minOccurs="0" maxOccurs="1" name="ticket" type="s:string" />
            <s:element minOccurs="0" maxOccurs="1" name="hresult" type="s:string" />
            <s:element minOccurs="0" maxOccurs="1" name="message" type="s:string" />
          </s:sequence>
        </s:complexType>
      </s:element>
      <s:element name="connectionErrorResponse">
        <s:complexType>
          <s:sequence>
            <s:element minOccurs="0" maxOccurs="1" name="connectionErrorResult" type="s:string" />
          </s:sequence>
        </s:complexType>
      </s:element>
      <s:element name="closeConnection">
        <s:complexType>
          <s:sequence>
            <s:element minOccurs="0" maxOccurs="1" name="ticket" type="s:string" />
          </s:sequence>
        </s:complexType>
      </s:element>
      <s:element name="closeConnectionResponse">
        <s:complexType>
          <s:sequence>
            <s:element minOccurs="0" maxOccurs="1" name="closeConnectionResult" type="s:string" />
          </s:sequence>
        </s:complexType>
      </s:element>
      <s:element name="getLastError">
        <s:complexType>
          <s:sequence>
            <s:element minOccurs="0" maxOccurs="1" name="ticket" type="s:string" />
          </s:sequence>
        </s:complexType>
      </s:element>
      <s:element name="getLastErrorResponse">
        <s:complexType>
          <s:sequence>
            <s:element minOccurs="0" maxOccurs="1" name="getLastErrorResult" type="s:string" />
          </s:sequence>
        </s:complexType>
      </s:element>
    </s:schema>
  </types>

  <message name="serverVersionSoapIn">
    <part name="parameters" element="tns:serverVersion" />
  </message>
  <message name="serverVersionSoapOut">
    <part name="parameters" element="tns:serverVersionResponse" />
  </message>
  <message name="clientVersionSoapIn">
    <part name="parameters" element="tns:clientVersion" />
  </message>
  <message name="clientVersionSoapOut">
    <part name="parameters" element="tns:clientVersionResponse" />
  </message>
  <message name="authenticateSoapIn">
    <part name="parameters" element="tns:authenticate" />
  </message>
  <message name="authenticateSoapOut">
    <part name="parameters" element="tns:authenticateResponse" />
  </message>
  <message name="sendRequestXMLSoapIn">
    <part name="parameters" element="tns:sendRequestXML" />
  </message>
  <message name="sendRequestXMLSoapOut">
    <part name="parameters" element="tns:sendRequestXMLResponse" />
  </message>
  <message name="receiveResponseXMLSoapIn">
    <part name="parameters" element="tns:receiveResponseXML" />
  </message>
  <message name="receiveResponseXMLSoapOut">
    <part name="parameters" element="tns:receiveResponseXMLResponse" />
  </message>
  <message name="connectionErrorSoapIn">
    <part name="parameters" element="tns:connectionError" />
  </message>
  <message name="connectionErrorSoapOut">
    <part name="parameters" element="tns:connectionErrorResponse" />
  </message>
  <message name="closeConnectionSoapIn">
    <part name="parameters" element="tns:closeConnection" />
  </message>
  <message name="closeConnectionSoapOut">
    <part name="parameters" element="tns:closeConnectionResponse" />
  </message>
  <message name="getLastErrorSoapIn">
    <part name="parameters" element="tns:getLastError" />
  </message>
  <message name="getLastErrorSoapOut">
    <part name="parameters" element="tns:getLastErrorResponse" />
  </message>

  <portType name="QBWebConnectorSvcSoap">
    <operation name="serverVersion">
      <input message="tns:serverVersionSoapIn" />
      <output message="tns:serverVersionSoapOut" />
    </operation>
    <operation name="clientVersion">
      <input message="tns:clientVersionSoapIn" />
      <output message="tns:clientVersionSoapOut" />
    </operation>
    <operation name="authenticate">
      <input message="tns:authenticateSoapIn" />
      <output message="tns:authenticateSoapOut" />
    </operation>
    <operation name="sendRequestXML">
      <input message="tns:sendRequestXMLSoapIn" />
      <output message="tns:sendRequestXMLSoapOut" />
    </operation>
    <operation name="receiveResponseXML">
      <input message="tns:receiveResponseXMLSoapIn" />
      <output message="tns:receiveResponseXMLSoapOut" />
    </operation>
    <operation name="connectionError">
      <input message="tns:connectionErrorSoapIn" />
      <output message="tns:connectionErrorSoapOut" />
    </operation>
    <operation name="closeConnection">
      <input message="tns:closeConnectionSoapIn" />
      <output message="tns:closeConnectionSoapOut" />
    </operation>
    <operation name="getLastError">
      <input message="tns:getLastErrorSoapIn" />
      <output message="tns:getLastErrorSoapOut" />
    </operation>
  </portType>

  <binding name="QBWebConnectorSvcSoap" type="tns:QBWebConnectorSvcSoap">
    <soap:binding transport="http://schemas.xmlsoap.org/soap/http" />
    <operation name="serverVersion">
      <soap:operation soapAction="http://developer.intuit.com/serverVersion" style="document" />
      <input><soap:body use="literal" /></input>
      <output><soap:body use="literal" /></output>
    </operation>
    <operation name="clientVersion">
      <soap:operation soapAction="http://developer.intuit.com/clientVersion" style="document" />
      <input><soap:body use="literal" /></input>
      <output><soap:body use="literal" /></output>
    </operation>
    <operation name="authenticate">
      <soap:operation soapAction="http://developer.intuit.com/authenticate" style="document" />
      <input><soap:body use="literal" /></input>
      <output><soap:body use="literal" /></output>
    </operation>
    <operation name="sendRequestXML">
      <soap:operation soapAction="http://developer.intuit.com/sendRequestXML" style="document" />
      <input><soap:body use="literal" /></input>
      <output><soap:body use="literal" /></output>
    </operation>
    <operation name="receiveResponseXML">
      <soap:operation soapAction="http://developer.intuit.com/receiveResponseXML" style="document" />
      <input><soap:body use="literal" /></input>
      <output><soap:body use="literal" /></output>
    </operation>
    <operation name="connectionError">
      <soap:operation soapAction="http://developer.intuit.com/connectionError" style="document" />
      <input><soap:body use="literal" /></input>
      <output><soap:body use="literal" /></output>
    </operation>
    <operation name="closeConnection">
      <soap:operation soapAction="http://developer.intuit.com/closeConnection" style="document" />
      <input><soap:body use="literal" /></input>
      <output><soap:body use="literal" /></output>
    </operation>
    <operation name="getLastError">
      <soap:operation soapAction="http://developer.intuit.com/getLastError" style="document" />
      <input><soap:body use="literal" /></input>
      <output><soap:body use="literal" /></output>
    </operation>
  </binding>

  <service name="QBWebConnectorSvc">
    <port name="QBWebConnectorSvcSoap" binding="tns:QBWebConnectorSvcSoap">
      <soap:address location="${serviceUrl}" />
    </port>
  </service>
</definitions>`;
}
