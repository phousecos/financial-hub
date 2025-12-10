'use client';

import { useState, useEffect, useCallback } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import type { Company } from '@/lib/types';

interface SyncStatus {
  companyId: string;
  status: 'idle' | 'pending' | 'syncing';
  pendingOperations: number;
  activeSession: {
    id: string;
    currentStep: number;
    totalSteps: number;
    progress: number;
  } | null;
  lastSync: {
    completedAt: string;
    syncType: string;
  } | null;
  recentLogs: Array<{
    id: string;
    syncType: string;
    direction: string;
    status: string;
    recordsProcessed: number;
    recordsFailed: number;
    errorMessage: string | null;
    startedAt: string;
    completedAt: string | null;
  }>;
  transactionCounts: {
    qb_pull: number;
    amex_import: number;
    bank_feed: number;
    manual: number;
  };
}

interface SyncConfig {
  company: {
    id: string;
    name: string;
    code: string | null;
    qbFilePath: string | null;
    qbListId: string | null;
    active: boolean;
  };
  bankAccounts: Array<{
    id: string;
    accountName: string;
    accountType: string | null;
    lastFour: string | null;
    qbAccountRef: string | null;
  }>;
  syncSettings: {
    autoSyncEnabled: boolean;
    syncInterval: string;
    lastFullSync: string | null;
    defaultExpenseAccount: string | null;
    defaultAPAccount: string | null;
    defaultCreditCardAccount: string | null;
  };
}

export default function SyncPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>('');
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [syncConfig, setSyncConfig] = useState<SyncConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // QB File Path input
  const [qbFilePath, setQbFilePath] = useState('');

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  // Load companies on mount
  useEffect(() => {
    async function loadCompanies() {
      const { data, error } = await supabase
        .from('companies')
        .select('*')
        .eq('active', true)
        .order('name');

      if (error) {
        console.error('Error loading companies:', error);
        setError('Failed to load companies');
      } else {
        setCompanies(data || []);
        if (data && data.length > 0) {
          setSelectedCompanyId(data[0].id);
        }
      }
      setLoading(false);
    }

    loadCompanies();
  }, [supabase]);

  // Load sync status and config when company changes
  const loadSyncData = useCallback(async () => {
    if (!selectedCompanyId) return;

    try {
      // Load status and config in parallel
      const [statusRes, configRes] = await Promise.all([
        fetch(`/api/sync/status?companyId=${selectedCompanyId}`),
        fetch(`/api/sync/config?companyId=${selectedCompanyId}`),
      ]);

      if (statusRes.ok) {
        const statusData = await statusRes.json();
        setSyncStatus(statusData);
      }

      if (configRes.ok) {
        const configData = await configRes.json();
        setSyncConfig(configData);
        setQbFilePath(configData.company.qbFilePath || '');
      }
    } catch (err) {
      console.error('Error loading sync data:', err);
    }
  }, [selectedCompanyId]);

  useEffect(() => {
    loadSyncData();
  }, [loadSyncData]);

  // Refresh status periodically when syncing
  useEffect(() => {
    if (syncStatus?.status === 'syncing' || syncStatus?.status === 'pending') {
      const interval = setInterval(loadSyncData, 5000);
      return () => clearInterval(interval);
    }
  }, [syncStatus?.status, loadSyncData]);

  // Trigger sync
  async function triggerSync(syncType: string) {
    setSyncing(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const res = await fetch('/api/sync/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId: selectedCompanyId,
          syncType,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to trigger sync');
      } else {
        setSuccessMessage(data.message || 'Sync queued successfully');
        loadSyncData();
      }
    } catch (err) {
      setError('Network error');
    } finally {
      setSyncing(false);
    }
  }

  // Save QB configuration
  async function saveConfig() {
    setError(null);
    setSuccessMessage(null);

    try {
      const res = await fetch('/api/sync/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId: selectedCompanyId,
          qbFilePath: qbFilePath || null,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to save configuration');
      } else {
        setSuccessMessage('Configuration saved');
        loadSyncData();
      }
    } catch (err) {
      setError('Network error');
    }
  }

  // Download QWC file
  async function downloadQWC() {
    window.open(`/api/sync/qwc?companyId=${selectedCompanyId}`, '_blank');
  }

  if (loading) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-4 text-gray-900">QuickBooks Sync</h1>
        <p className="text-gray-700">Loading...</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold mb-6 text-gray-900">QuickBooks Sync</h1>

      {/* Company Selector */}
      <div className="mb-6">
        <label className="block text-sm font-medium mb-2 text-gray-900">Select Company</label>
        <select
          value={selectedCompanyId}
          onChange={(e) => setSelectedCompanyId(e.target.value)}
          className="w-full max-w-md p-2 border rounded bg-white text-gray-900"
        >
          {companies.map((company) => (
            <option key={company.id} value={company.id}>
              {company.name} {company.code ? `(${company.code})` : ''}
            </option>
          ))}
        </select>
      </div>

      {/* Messages */}
      {error && (
        <div className="mb-4 p-3 bg-red-100 text-red-700 rounded">{error}</div>
      )}
      {successMessage && (
        <div className="mb-4 p-3 bg-green-100 text-green-700 rounded">{successMessage}</div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column - Configuration */}
        <div className="space-y-6">
          {/* QB Configuration */}
          <div className="bg-white p-4 rounded-lg shadow">
            <h2 className="text-lg font-semibold mb-4 text-gray-900">QuickBooks Configuration</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1 text-gray-900">
                  QB Company File Path (optional)
                </label>
                <input
                  type="text"
                  value={qbFilePath}
                  onChange={(e) => setQbFilePath(e.target.value)}
                  placeholder="C:\Users\...\Company.qbw"
                  className="w-full p-2 border rounded text-gray-900"
                />
                <p className="text-xs text-gray-600 mt-1">
                  Leave blank to use currently open QB file
                </p>
              </div>

              <button
                onClick={saveConfig}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Save Configuration
              </button>
            </div>
          </div>

          {/* Web Connector Setup */}
          <div className="bg-white p-4 rounded-lg shadow">
            <h2 className="text-lg font-semibold mb-4 text-gray-900">Web Connector Setup</h2>

            <div className="space-y-3">
              <p className="text-sm text-gray-700">
                Download and import the QWC file into QuickBooks Web Connector to enable
                syncing.
              </p>

              {/* Show the username that will be used */}
              {syncConfig?.company && (
                <div className="p-2 bg-blue-50 rounded text-sm">
                  <span className="text-gray-700">Username for this company: </span>
                  <code className="font-mono text-blue-700">
                    sync-{syncConfig.company.code?.toLowerCase() || syncConfig.company.id.substring(0, 8)}
                  </code>
                </div>
              )}

              <button
                onClick={downloadQWC}
                className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
              >
                Download QWC File
              </button>

              <div className="mt-4 p-3 bg-gray-50 rounded text-sm">
                <p className="font-medium mb-2 text-gray-900">Setup Instructions:</p>
                <ol className="list-decimal list-inside space-y-1 text-gray-700">
                  <li>Download the QWC file above</li>
                  <li>Open QuickBooks Web Connector</li>
                  <li>Click &quot;Add an application&quot;</li>
                  <li>Select the downloaded QWC file</li>
                  <li>Authorize the application when prompted in QuickBooks</li>
                  <li>Set the password in Web Connector (from QBWC_PASSWORD)</li>
                  <li>Click &quot;Update Selected&quot; to sync</li>
                </ol>
                <p className="mt-2 text-gray-600 italic">
                  Each company has its own QWC file with a unique username.
                  You can add multiple QWC files to sync different companies.
                </p>
              </div>
            </div>
          </div>

          {/* Pull from QB */}
          <div className="bg-white p-4 rounded-lg shadow">
            <h2 className="text-lg font-semibold mb-4 text-gray-900">Pull from QuickBooks</h2>

            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => triggerSync('full')}
                disabled={syncing}
                className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50"
              >
                Full Sync
              </button>
              <button
                onClick={() => triggerSync('transactions')}
                disabled={syncing}
                className="px-4 py-2 bg-indigo-500 text-white rounded hover:bg-indigo-600 disabled:opacity-50"
              >
                Transactions Only
              </button>
              <button
                onClick={() => triggerSync('vendors')}
                disabled={syncing}
                className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 disabled:opacity-50"
              >
                Vendors
              </button>
              <button
                onClick={() => triggerSync('accounts')}
                disabled={syncing}
                className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 disabled:opacity-50"
              >
                Accounts
              </button>
            </div>

            <p className="text-xs text-gray-600 mt-3">
              Pull data from QuickBooks into Financial Hub.
            </p>
          </div>

          {/* Push to QB */}
          <div className="bg-white p-4 rounded-lg shadow">
            <h2 className="text-lg font-semibold mb-4 text-gray-900">Push to QuickBooks</h2>

            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => triggerSync('push_transactions')}
                disabled={syncing}
                className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
              >
                Push Transactions
              </button>
              <button
                onClick={() => triggerSync('push_with_receipts')}
                disabled={syncing}
                className="px-4 py-2 bg-green-700 text-white rounded hover:bg-green-800 disabled:opacity-50"
              >
                Push with Receipts
              </button>
            </div>

            <p className="text-xs text-gray-600 mt-3">
              Push transactions from Financial Hub to QuickBooks.
              &quot;Push with Receipts&quot; includes receipt info in the QB memo field.
            </p>
          </div>

          <div className="text-xs text-gray-500 bg-gray-50 p-3 rounded">
            <strong>Note:</strong> Clicking these buttons queues operations. Open QB Web Connector and click
            &quot;Update Selected&quot; to execute.
          </div>
        </div>

        {/* Right Column - Status */}
        <div className="space-y-6">
          {/* Current Status */}
          <div className="bg-white p-4 rounded-lg shadow">
            <h2 className="text-lg font-semibold mb-4 text-gray-900">Sync Status</h2>

            {syncStatus && (
              <div className="space-y-4">
                {/* Status Badge */}
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-900">Status:</span>
                  <span
                    className={`px-2 py-1 rounded text-sm ${
                      syncStatus.status === 'syncing'
                        ? 'bg-blue-100 text-blue-700'
                        : syncStatus.status === 'pending'
                        ? 'bg-yellow-100 text-yellow-700'
                        : 'bg-gray-100 text-gray-700'
                    }`}
                  >
                    {syncStatus.status === 'syncing'
                      ? 'Syncing...'
                      : syncStatus.status === 'pending'
                      ? `Pending (${syncStatus.pendingOperations} ops)`
                      : 'Idle'}
                  </span>
                </div>

                {/* Progress Bar */}
                {syncStatus.activeSession && (
                  <div>
                    <div className="flex justify-between text-sm mb-1 text-gray-900">
                      <span>Progress</span>
                      <span>{syncStatus.activeSession.progress}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-blue-600 h-2 rounded-full transition-all"
                        style={{ width: `${syncStatus.activeSession.progress}%` }}
                      />
                    </div>
                    <p className="text-xs text-gray-600 mt-1">
                      Step {syncStatus.activeSession.currentStep} of{' '}
                      {syncStatus.activeSession.totalSteps}
                    </p>
                  </div>
                )}

                {/* Last Sync */}
                {syncStatus.lastSync && (
                  <div>
                    <span className="text-sm font-medium text-gray-900">Last Sync: </span>
                    <span className="text-sm text-gray-700">
                      {new Date(syncStatus.lastSync.completedAt).toLocaleString()} (
                      {syncStatus.lastSync.syncType})
                    </span>
                  </div>
                )}

                {/* Transaction Counts */}
                <div>
                  <span className="text-sm font-medium text-gray-900">Transactions by Source:</span>
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    <div className="text-sm text-gray-700">
                      <span className="text-gray-600">From QB:</span>{' '}
                      {syncStatus.transactionCounts.qb_pull}
                    </div>
                    <div className="text-sm text-gray-700">
                      <span className="text-gray-600">Amex Import:</span>{' '}
                      {syncStatus.transactionCounts.amex_import}
                    </div>
                    <div className="text-sm text-gray-700">
                      <span className="text-gray-600">Bank Feed:</span>{' '}
                      {syncStatus.transactionCounts.bank_feed}
                    </div>
                    <div className="text-sm text-gray-700">
                      <span className="text-gray-600">Manual:</span>{' '}
                      {syncStatus.transactionCounts.manual}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Recent Logs */}
          <div className="bg-white p-4 rounded-lg shadow">
            <h2 className="text-lg font-semibold mb-4 text-gray-900">Recent Sync Logs</h2>

            {syncStatus?.recentLogs && syncStatus.recentLogs.length > 0 ? (
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {syncStatus.recentLogs.map((log) => (
                  <div
                    key={log.id}
                    className={`p-2 rounded text-sm ${
                      log.status === 'success'
                        ? 'bg-green-50'
                        : log.status === 'error'
                        ? 'bg-red-50'
                        : 'bg-yellow-50'
                    }`}
                  >
                    <div className="flex justify-between">
                      <span className="font-medium text-gray-900">{log.syncType}</span>
                      <span
                        className={`text-xs ${
                          log.status === 'success'
                            ? 'text-green-600'
                            : log.status === 'error'
                            ? 'text-red-600'
                            : 'text-yellow-600'
                        }`}
                      >
                        {log.status}
                      </span>
                    </div>
                    <div className="text-xs text-gray-600">
                      {new Date(log.startedAt).toLocaleString()}
                      {log.recordsProcessed > 0 && ` - ${log.recordsProcessed} records`}
                      {log.recordsFailed > 0 && ` (${log.recordsFailed} failed)`}
                    </div>
                    {log.errorMessage && (
                      <div className="text-xs text-red-600 mt-1">{log.errorMessage}</div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-600">No sync logs yet</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
