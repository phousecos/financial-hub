// app/receipts/logs/page.tsx - Email Processing Logs
'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { format } from 'date-fns';

interface EmailLog {
  id: string;
  email_from: string;
  email_to: string;
  email_subject: string;
  email_size: number;
  parsed_company_name: string | null;
  parsed_amount: number | null;
  parsed_description: string | null;
  receipt_id: string | null;
  status: 'success' | 'error' | 'warning';
  error_message: string | null;
  raw_first_line: string | null;
  processing_time_ms: number;
  created_at: string;
}

export default function EmailLogsPage() {
  const [logs, setLogs] = useState<EmailLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'success' | 'error' | 'warning'>('all');
  const [cleaning, setCleaning] = useState(false);

  useEffect(() => {
    loadLogs();
  }, [filter]);

  async function loadLogs() {
    try {
      let query = supabase
        .from('email_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (filter !== 'all') {
        query = query.eq('status', filter);
      }

      const { data, error } = await query;

      if (error) throw error;
      setLogs(data || []);
    } catch (error) {
      console.error('Error loading logs:', error);
    } finally {
      setLoading(false);
    }
  }

  async function cleanupOldLogs() {
    if (!confirm('Delete all logs older than 45 days?')) return;

    setCleaning(true);
    try {
      const { data, error } = await supabase.rpc('cleanup_old_email_logs');

      if (error) throw error;

      alert(`Deleted ${data || 0} old log entries`);
      await loadLogs();
    } catch (error) {
      console.error('Error cleaning up logs:', error);
      alert('Error cleaning up logs');
    } finally {
      setCleaning(false);
    }
  }

  const stats = {
    total: logs.length,
    success: logs.filter(l => l.status === 'success').length,
    error: logs.filter(l => l.status === 'error').length,
    warning: logs.filter(l => l.status === 'warning').length,
  };

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  return (
    <div className="px-4 sm:px-0">
      <div className="sm:flex sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Email Processing Logs</h1>
          <p className="mt-2 text-sm text-gray-700">
            Monitor receipt email processing and troubleshoot issues
          </p>
        </div>
        <button
          onClick={cleanupOldLogs}
          disabled={cleaning}
          className="mt-4 sm:mt-0 inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
        >
          {cleaning ? 'Cleaning...' : 'Cleanup Old Logs (45+ days)'}
        </button>
      </div>

      {/* Stats */}
      <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-4">
        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="text-sm font-medium text-gray-500">Total</div>
              </div>
            </div>
            <div className="mt-1 text-3xl font-semibold text-gray-900">{stats.total}</div>
          </div>
        </div>

        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="text-sm font-medium text-green-600">Success</div>
              </div>
            </div>
            <div className="mt-1 text-3xl font-semibold text-green-600">{stats.success}</div>
          </div>
        </div>

        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="text-sm font-medium text-yellow-600">Warnings</div>
              </div>
            </div>
            <div className="mt-1 text-3xl font-semibold text-yellow-600">{stats.warning}</div>
          </div>
        </div>

        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="text-sm font-medium text-red-600">Errors</div>
              </div>
            </div>
            <div className="mt-1 text-3xl font-semibold text-red-600">{stats.error}</div>
          </div>
        </div>
      </div>

      {/* Filter */}
      <div className="mt-6">
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as any)}
          className="block w-full sm:w-64 rounded-md border border-gray-300 bg-white py-2 px-3 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500 sm:text-sm"
        >
          <option value="all">All Logs</option>
          <option value="success">Success Only</option>
          <option value="warning">Warnings Only</option>
          <option value="error">Errors Only</option>
        </select>
      </div>

      {/* Logs Table */}
      <div className="mt-6 flex flex-col">
        <div className="-my-2 -mx-4 overflow-x-auto sm:-mx-6 lg:-mx-8">
          <div className="inline-block min-w-full py-2 align-middle md:px-6 lg:px-8">
            {logs.length === 0 ? (
              <div className="text-center py-12 bg-white shadow sm:rounded-lg">
                <p className="text-gray-500">No email logs found</p>
              </div>
            ) : (
              <div className="overflow-hidden shadow ring-1 ring-black ring-opacity-5 md:rounded-lg">
                <table className="min-w-full divide-y divide-gray-300">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900">
                        Time
                      </th>
                      <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                        From
                      </th>
                      <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                        Parsed Info
                      </th>
                      <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                        Status
                      </th>
                      <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                        Details
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white">
                    {logs.map((log) => (
                      <tr key={log.id}>
                        <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm text-gray-900">
                          {format(new Date(log.created_at), 'MMM d, h:mm a')}
                          <div className="text-xs text-gray-500">
                            {log.processing_time_ms}ms
                          </div>
                        </td>
                        <td className="px-3 py-4 text-sm text-gray-500">
                          <div className="truncate max-w-xs">{log.email_from}</div>
                          <div className="text-xs text-gray-400 truncate max-w-xs">
                            {log.email_subject}
                          </div>
                        </td>
                        <td className="px-3 py-4 text-sm">
                          {log.parsed_company_name && (
                            <div className="font-medium text-gray-900">
                              {log.parsed_company_name}
                            </div>
                          )}
                          {log.parsed_amount && (
                            <div className="text-gray-600">
                              ${log.parsed_amount.toFixed(2)}
                            </div>
                          )}
                          {log.parsed_description && (
                            <div className="text-xs text-gray-500 truncate max-w-xs">
                              {log.parsed_description}
                            </div>
                          )}
                          {!log.parsed_company_name && (
                            <div className="text-xs text-gray-400 italic">
                              Not parsed
                            </div>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-3 py-4 text-sm">
                          <span
                            className={`inline-flex rounded-full px-2 text-xs font-semibold leading-5 ${
                              log.status === 'success'
                                ? 'bg-green-100 text-green-800'
                                : log.status === 'warning'
                                ? 'bg-yellow-100 text-yellow-800'
                                : 'bg-red-100 text-red-800'
                            }`}
                          >
                            {log.status}
                          </span>
                        </td>
                        <td className="px-3 py-4 text-sm text-gray-500">
                          {log.error_message && (
                            <div className="text-red-600 text-xs max-w-xs truncate">
                              {log.error_message}
                            </div>
                          )}
                          {log.raw_first_line && (
                            <div className="text-xs text-gray-400 max-w-xs truncate">
                              Raw: {log.raw_first_line}
                            </div>
                          )}
                          {log.receipt_id && (
                            <a
                              href={`/receipts`}
                              className="text-blue-600 hover:text-blue-800 text-xs"
                            >
                              View Receipt →
                            </a>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}