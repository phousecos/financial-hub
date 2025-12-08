'use client';

import { useState } from 'react';

interface ProcessorResult {
  success: boolean;
  processed?: number;
  errors?: string[];
  files?: { name: string; status: string; receiptId?: string }[];
  timestamp?: string;
  error?: string;
}

export default function DrivePage() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ProcessorResult | null>(null);
  const [lastRun, setLastRun] = useState<string | null>(null);

  const runProcessor = async () => {
    setLoading(true);
    setResult(null);

    try {
      const response = await fetch('/api/processor', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();
      setResult(data);
      setLastRun(new Date().toLocaleString());
    } catch (error) {
      setResult({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to run processor',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="px-4 sm:px-0">
      <div className="sm:flex sm:items-center sm:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Google Drive Processor</h1>
          <p className="mt-1 text-sm text-gray-600">
            Process receipts from Google Drive using Claude Vision AI
          </p>
        </div>
        <div className="mt-4 sm:mt-0">
          <button
            onClick={runProcessor}
            disabled={loading}
            className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Processing...
              </>
            ) : (
              'Run Processor'
            )}
          </button>
        </div>
      </div>

      {/* Info Card */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
        <h3 className="text-sm font-medium text-blue-800 mb-2">How it works</h3>
        <ul className="text-sm text-blue-700 space-y-1">
          <li>1. Drop PDFs or images into your Google Drive &quot;Unprocessed&quot; folder</li>
          <li>2. Claude Vision AI extracts: Company, Amount, Vendor, Date, Description</li>
          <li>3. Files are uploaded to Supabase and moved to &quot;Processed&quot; folder</li>
          <li>4. Receipts appear in the Receipts page</li>
        </ul>
        <p className="mt-3 text-sm text-blue-600">
          Automated: Runs every 5 minutes via Vercel Cron (when deployed)
        </p>
      </div>

      {/* Last Run Time */}
      {lastRun && (
        <div className="text-sm text-gray-500 mb-4">
          Last manual run: {lastRun}
        </div>
      )}

      {/* Results */}
      {result && (
        <div className={`rounded-lg border p-4 ${result.success ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
          <div className="flex items-center mb-3">
            {result.success ? (
              <svg className="h-5 w-5 text-green-500 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg className="h-5 w-5 text-red-500 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            )}
            <h3 className={`text-lg font-medium ${result.success ? 'text-green-800' : 'text-red-800'}`}>
              {result.success ? 'Processing Complete' : 'Processing Failed'}
            </h3>
          </div>

          {result.success && (
            <>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div className="bg-white rounded p-3">
                  <div className="text-2xl font-bold text-gray-900">{result.processed || 0}</div>
                  <div className="text-sm text-gray-500">Files Processed</div>
                </div>
                <div className="bg-white rounded p-3">
                  <div className="text-2xl font-bold text-gray-900">{result.errors?.length || 0}</div>
                  <div className="text-sm text-gray-500">Errors</div>
                </div>
              </div>

              {result.files && result.files.length > 0 && (
                <div className="bg-white rounded border">
                  <div className="px-4 py-2 border-b bg-gray-50">
                    <h4 className="text-sm font-medium text-gray-700">Processed Files</h4>
                  </div>
                  <ul className="divide-y">
                    {result.files.map((file, index) => (
                      <li key={index} className="px-4 py-2 flex items-center justify-between">
                        <span className="text-sm text-gray-900 truncate max-w-xs">{file.name}</span>
                        <span className={`text-xs px-2 py-1 rounded ${
                          file.status === 'success'
                            ? 'bg-green-100 text-green-700'
                            : file.status.startsWith('skipped')
                            ? 'bg-yellow-100 text-yellow-700'
                            : 'bg-red-100 text-red-700'
                        }`}>
                          {file.status}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {result.files && result.files.length === 0 && (
                <p className="text-sm text-green-700">No new files to process in the unprocessed folder.</p>
              )}
            </>
          )}

          {!result.success && result.error && (
            <p className="text-sm text-red-700">{result.error}</p>
          )}

          {result.errors && result.errors.length > 0 && (
            <div className="mt-4">
              <h4 className="text-sm font-medium text-red-800 mb-2">Errors:</h4>
              <ul className="text-sm text-red-700 space-y-1">
                {result.errors.map((error, index) => (
                  <li key={index}>- {error}</li>
                ))}
              </ul>
            </div>
          )}

          {result.timestamp && (
            <p className="text-xs text-gray-500 mt-3">
              Completed at: {new Date(result.timestamp).toLocaleString()}
            </p>
          )}
        </div>
      )}

      {/* Configuration Info */}
      <div className="mt-8 bg-gray-50 rounded-lg border p-4">
        <h3 className="text-sm font-medium text-gray-700 mb-3">Configuration Checklist</h3>
        <ul className="text-sm text-gray-600 space-y-2">
          <li className="flex items-center">
            <span className="mr-2">-</span>
            <code className="bg-gray-200 px-1 rounded text-xs">DRIVE_UNPROCESSED_FOLDER_ID</code>
            <span className="ml-2">Google Drive folder for incoming files</span>
          </li>
          <li className="flex items-center">
            <span className="mr-2">-</span>
            <code className="bg-gray-200 px-1 rounded text-xs">DRIVE_PROCESSED_FOLDER_ID</code>
            <span className="ml-2">Google Drive folder for completed files</span>
          </li>
          <li className="flex items-center">
            <span className="mr-2">-</span>
            <code className="bg-gray-200 px-1 rounded text-xs">GOOGLE_SERVICE_ACCOUNT_JSON</code>
            <span className="ml-2">Service account credentials (JSON)</span>
          </li>
          <li className="flex items-center">
            <span className="mr-2">-</span>
            <code className="bg-gray-200 px-1 rounded text-xs">ANTHROPIC_API_KEY</code>
            <span className="ml-2">Claude API key for vision processing</span>
          </li>
          <li className="flex items-center">
            <span className="mr-2">-</span>
            <code className="bg-gray-200 px-1 rounded text-xs">PROCESSOR_SECRET</code>
            <span className="ml-2">(Optional) Secret to secure the endpoint</span>
          </li>
        </ul>
      </div>
    </div>
  );
}
