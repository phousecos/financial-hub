// app/receipts/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { supabase, getReceiptUrl } from '@/lib/supabase';
import type { Receipt, Company } from '@/lib/types';
import { format } from 'date-fns';

interface ReceiptWithCompany extends Receipt {
  company?: Company;
}

export default function ReceiptsPage() {
  const [receipts, setReceipts] = useState<ReceiptWithCompany[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCompany, setSelectedCompany] = useState<string>('all');
  const [showMatched, setShowMatched] = useState<'all' | 'matched' | 'unmatched'>('all');
  const [selectedReceipt, setSelectedReceipt] = useState<ReceiptWithCompany | null>(null);
  const [signedFileUrl, setSignedFileUrl] = useState<string | null>(null);
  const [loadingFileUrl, setLoadingFileUrl] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [processResult, setProcessResult] = useState<{
    success: boolean;
    processed?: number;
    total?: number;
    remaining?: number;
    errors?: string[];
    files?: { name: string; status: string }[];
    message?: string;
  } | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    company_id: '',
    amount: '',
    transaction_date: '',
    description: '',
    vendor: '',
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadCompanies();
    loadReceipts();
  }, [selectedCompany, showMatched]);

  // Load signed URL when a receipt is selected
  useEffect(() => {
    async function loadSignedUrl() {
      if (!selectedReceipt?.file_url) {
        setSignedFileUrl(null);
        return;
      }

      setLoadingFileUrl(true);
      try {
        // If file_url is already a full URL (legacy data), try to use it directly
        // Otherwise generate a signed URL from the storage path
        if (selectedReceipt.file_url.startsWith('http')) {
          // Legacy: try the URL directly, but it may fail if bucket is not public
          setSignedFileUrl(selectedReceipt.file_url);
        } else {
          // New format: generate signed URL from path
          const url = await getReceiptUrl(selectedReceipt.file_url);
          setSignedFileUrl(url);
        }
      } catch (error) {
        console.error('Error getting signed URL:', error);
        setSignedFileUrl(null);
      } finally {
        setLoadingFileUrl(false);
      }
    }

    loadSignedUrl();
  }, [selectedReceipt]);

  async function loadCompanies() {
    const { data } = await supabase
      .from('companies')
      .select('*')
      .order('name');
    
    setCompanies(data || []);
  }

  async function loadReceipts() {
    try {
      let query = supabase
        .from('receipts')
        .select(`
          *,
          company:companies(*)
        `)
        .order('email_received_at', { ascending: false });

      // Filter by company
      if (selectedCompany !== 'all') {
        query = query.eq('company_id', selectedCompany);
      }

      // Filter by matched status
      if (showMatched === 'matched') {
        query = query.eq('matched', true);
      } else if (showMatched === 'unmatched') {
        query = query.eq('matched', false);
      }

      const { data, error } = await query;

      if (error) throw error;
      setReceipts(data || []);
    } catch (error) {
      console.error('Error loading receipts:', error);
    } finally {
      setLoading(false);
    }
  }

  async function processReceiptsFromDrive() {
    setProcessing(true);
    setProcessResult(null);

    try {
      const response = await fetch('/api/processor', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();

      if (!response.ok) {
        setProcessResult({
          success: false,
          message: data.error || 'Failed to process receipts',
          errors: data.details ? [JSON.stringify(data.details)] : undefined,
        });
      } else {
        let message = '';
        if (data.processed === 0 && data.total === 0) {
          message = 'No new receipts found in Google Drive';
          // Add debug info if available
          if (data.debug) {
            if (data.debug.allFilesInFolder === 0) {
              message += ' (folder is empty)';
            } else {
              message += ` (found ${data.debug.allFilesInFolder} file(s) but none are PDFs/images)`;
            }
          }
        } else if (data.processed === 0) {
          message = `Checked ${data.total} file(s), none needed processing`;
        } else {
          message = `Processed ${data.processed} receipt(s)`;
          if (data.remaining > 0) {
            message += ` (${data.remaining} more pending - will process automatically)`;
          }
        }
        setProcessResult({
          success: true,
          processed: data.processed,
          total: data.total,
          remaining: data.remaining,
          errors: data.errors,
          files: data.files,
          message,
        });
        // Reload receipts if any were processed
        if (data.processed > 0) {
          await loadReceipts();
        }
      }
    } catch (error) {
      setProcessResult({
        success: false,
        message: error instanceof Error ? error.message : 'Failed to connect to processor',
      });
    } finally {
      setProcessing(false);
    }
  }

  async function deleteReceipt(id: string) {
    if (!confirm('Delete this receipt? This cannot be undone.')) return;

    try {
      const { error } = await supabase
        .from('receipts')
        .delete()
        .eq('id', id);

      if (error) throw error;
      await loadReceipts();
    } catch (error) {
      console.error('Error deleting receipt:', error);
      alert('Error deleting receipt');
    }
  }

  function startEditing() {
    if (!selectedReceipt) return;
    setEditForm({
      company_id: selectedReceipt.company_id || '',
      amount: selectedReceipt.amount?.toString() || '',
      transaction_date: selectedReceipt.transaction_date || '',
      description: selectedReceipt.description || '',
      vendor: selectedReceipt.vendor || '',
    });
    setIsEditing(true);
  }

  function cancelEditing() {
    setIsEditing(false);
    setEditForm({
      company_id: '',
      amount: '',
      transaction_date: '',
      description: '',
      vendor: '',
    });
  }

  async function saveReceipt() {
    if (!selectedReceipt) return;
    setSaving(true);

    try {
      const { error } = await supabase
        .from('receipts')
        .update({
          company_id: editForm.company_id || null,
          amount: editForm.amount ? parseFloat(editForm.amount) : null,
          transaction_date: editForm.transaction_date || null,
          description: editForm.description || null,
          vendor: editForm.vendor || null,
        })
        .eq('id', selectedReceipt.id);

      if (error) throw error;

      // Reload receipts and update selected receipt
      await loadReceipts();

      // Find the updated receipt
      const { data: updatedReceipt } = await supabase
        .from('receipts')
        .select('*, company:companies(*)')
        .eq('id', selectedReceipt.id)
        .single();

      if (updatedReceipt) {
        setSelectedReceipt(updatedReceipt);
      }

      setIsEditing(false);
    } catch (error) {
      console.error('Error saving receipt:', error);
      alert('Error saving receipt');
    } finally {
      setSaving(false);
    }
  }

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
        <div className="sm:flex-auto">
          <h1 className="text-3xl font-bold" style={{ color: '#111827' }}>Receipts</h1>
          <p className="mt-2 text-sm" style={{ color: '#374151' }}>
            All receipts received via email, organized by company.
          </p>
        </div>
        <div className="mt-4 sm:mt-0 sm:ml-4">
          <button
            onClick={processReceiptsFromDrive}
            disabled={processing}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {processing ? (
              <>
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Processing...
              </>
            ) : (
              <>
                <svg className="-ml-1 mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                Process from Drive
              </>
            )}
          </button>
        </div>
      </div>

      {/* Process Result Message */}
      {processResult && (
        <div className={`mt-4 p-4 rounded-md ${processResult.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
          <div className="flex">
            <div className="flex-shrink-0">
              {processResult.success ? (
                <svg className="h-5 w-5 text-green-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
              ) : (
                <svg className="h-5 w-5 text-red-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              )}
            </div>
            <div className="ml-3">
              <p className={`text-sm font-medium ${processResult.success ? 'text-green-800' : 'text-red-800'}`}>
                {processResult.message}
              </p>
              {processResult.errors && processResult.errors.length > 0 && (
                <ul className="mt-2 text-sm text-red-700 list-disc list-inside">
                  {processResult.errors.map((err, i) => (
                    <li key={i}>{err}</li>
                  ))}
                </ul>
              )}
              {processResult.files && processResult.files.length > 0 && (
                <details className="mt-2">
                  <summary className="text-sm text-gray-600 cursor-pointer hover:text-gray-800">
                    View file details ({processResult.files.length} files)
                  </summary>
                  <ul className="mt-1 text-xs text-gray-600 list-none space-y-1">
                    {processResult.files.map((file, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className={`flex-shrink-0 ${file.status.startsWith('success') ? 'text-green-600' : file.status.startsWith('skipped') ? 'text-yellow-600' : 'text-red-600'}`}>
                          {file.status.startsWith('success') ? '✓' : file.status.startsWith('skipped') ? '○' : '✗'}
                        </span>
                        <span><strong>{file.name}</strong>: {file.status}</span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
            <div className="ml-auto pl-3">
              <button
                onClick={() => setProcessResult(null)}
                className={`inline-flex rounded-md p-1.5 ${processResult.success ? 'text-green-500 hover:bg-green-100' : 'text-red-500 hover:bg-red-100'}`}
              >
                <span className="sr-only">Dismiss</span>
                <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="mt-6 flex flex-col sm:flex-row gap-4">
        <div className="flex-1">
          <label htmlFor="company" className="block text-sm font-medium" style={{ color: '#374151' }}>
            Company
          </label>
          <select
            id="company"
            value={selectedCompany}
            onChange={(e) => setSelectedCompany(e.target.value)}
            className="mt-1 block w-full rounded-md border border-gray-300 bg-white py-2 px-3 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500 sm:text-sm"
          >
            <option value="all">All Companies</option>
            {companies.map((company) => (
              <option key={company.id} value={company.id}>
                {company.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex-1">
          <label htmlFor="status" className="block text-sm font-medium" style={{ color: '#374151' }}>
            Status
          </label>
          <select
            id="status"
            value={showMatched}
            onChange={(e) => setShowMatched(e.target.value as any)}
            className="mt-1 block w-full rounded-md border border-gray-300 bg-white py-2 px-3 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500 sm:text-sm"
          >
            <option value="all">All Receipts</option>
            <option value="unmatched">Unmatched Only</option>
            <option value="matched">Matched Only</option>
          </select>
        </div>
      </div>

      {/* Receipts List */}
      <div className="mt-8">
        {receipts.length === 0 ? (
          <div className="text-center py-12 bg-white shadow sm:rounded-lg">
            <svg
              className="mx-auto h-12 w-12 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            <h3 className="mt-2 text-sm font-medium" style={{ color: '#111827' }}>No receipts</h3>
            <p className="mt-1 text-sm" style={{ color: '#6b7280' }}>
              Send an email to receipts@yourdomain.com to get started.
            </p>
            <p className="mt-1 text-xs" style={{ color: '#9ca3af' }}>
              Format: CompanyName | $247.89 | Description
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {receipts.map((receipt) => (
              <div
                key={receipt.id}
                className="bg-white overflow-hidden shadow rounded-lg hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => setSelectedReceipt(receipt)}
              >
                <div className="p-5">
                  {/* Company Badge */}
                  {receipt.company && (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 mb-2">
                      {receipt.company.name}
                    </span>
                  )}

                  {/* Amount */}
                  <div className="text-2xl font-bold" style={{ color: '#111827' }}>
                    {receipt.amount ? `$${receipt.amount.toFixed(2)}` : 'No amount'}
                  </div>

                  {/* Description */}
                  <p className="mt-2 text-sm line-clamp-2" style={{ color: '#4b5563' }}>
                    {receipt.description || 'No description'}
                  </p>

                  {/* Date */}
                  <p className="mt-2 text-xs" style={{ color: '#6b7280' }}>
                    {receipt.transaction_date
                      ? format(new Date(receipt.transaction_date), 'MMM d, yyyy')
                      : 'No date'}
                  </p>

                  {/* File Info */}
                  {receipt.file_name && (
                    <div className="mt-3 flex items-center text-xs" style={{ color: '#6b7280' }}>
                      <svg
                        className="h-4 w-4 mr-1"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"
                        />
                      </svg>
                      {receipt.file_name}
                    </div>
                  )}

                  {/* Status Badge */}
                  <div className="mt-3">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        receipt.matched
                          ? 'bg-green-100 text-green-800'
                          : 'bg-yellow-100 text-yellow-800'
                      }`}
                    >
                      {receipt.matched ? 'Matched' : 'Unmatched'}
                    </span>
                  </div>

                  {/* Actions */}
                  <div className="mt-4 flex justify-end space-x-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteReceipt(receipt.id);
                      }}
                      className="text-xs text-red-600 hover:text-red-900"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Receipt Detail Modal */}
      {selectedReceipt && (
        <div
          className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center p-4 z-50"
          onClick={() => setSelectedReceipt(null)}
        >
          <div
            className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6">
              <div className="flex justify-between items-start mb-4">
                <h2 className="text-2xl font-bold" style={{ color: '#111827' }}>
                  {isEditing ? 'Edit Receipt' : 'Receipt Details'}
                </h2>
                <div className="flex items-center gap-2">
                  {!isEditing && (
                    <button
                      onClick={startEditing}
                      className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                    >
                      Edit
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setSelectedReceipt(null);
                      setIsEditing(false);
                    }}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
                </div>
              </div>

              {isEditing ? (
                /* Edit Mode */
                <div className="grid grid-cols-2 gap-4 mb-6">
                  <div>
                    <label className="block text-sm font-medium" style={{ color: '#6b7280' }}>Company</label>
                    <select
                      value={editForm.company_id}
                      onChange={(e) => setEditForm({ ...editForm, company_id: e.target.value })}
                      className="mt-1 block w-full rounded-md border border-gray-300 bg-white py-2 px-3 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500 sm:text-sm"
                      style={{ color: '#1f2937' }}
                    >
                      <option value="">Select Company</option>
                      {companies.map((company) => (
                        <option key={company.id} value={company.id}>
                          {company.name} {company.code ? `(${company.code})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium" style={{ color: '#6b7280' }}>Amount</label>
                    <input
                      type="number"
                      step="0.01"
                      value={editForm.amount}
                      onChange={(e) => setEditForm({ ...editForm, amount: e.target.value })}
                      className="mt-1 block w-full rounded-md border border-gray-300 bg-white py-2 px-3 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500 sm:text-sm"
                      style={{ color: '#1f2937' }}
                      placeholder="0.00"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium" style={{ color: '#6b7280' }}>Date</label>
                    <input
                      type="date"
                      value={editForm.transaction_date}
                      onChange={(e) => setEditForm({ ...editForm, transaction_date: e.target.value })}
                      className="mt-1 block w-full rounded-md border border-gray-300 bg-white py-2 px-3 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500 sm:text-sm"
                      style={{ color: '#1f2937' }}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium" style={{ color: '#6b7280' }}>Vendor</label>
                    <input
                      type="text"
                      value={editForm.vendor}
                      onChange={(e) => setEditForm({ ...editForm, vendor: e.target.value })}
                      className="mt-1 block w-full rounded-md border border-gray-300 bg-white py-2 px-3 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500 sm:text-sm"
                      style={{ color: '#1f2937' }}
                      placeholder="Vendor name"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-sm font-medium" style={{ color: '#6b7280' }}>Description</label>
                    <textarea
                      value={editForm.description}
                      onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                      rows={2}
                      className="mt-1 block w-full rounded-md border border-gray-300 bg-white py-2 px-3 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500 sm:text-sm"
                      style={{ color: '#1f2937' }}
                      placeholder="Description"
                    />
                  </div>
                  <div className="col-span-2 flex justify-end gap-2 mt-2">
                    <button
                      onClick={cancelEditing}
                      className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={saveReceipt}
                      disabled={saving}
                      className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 disabled:opacity-50"
                    >
                      {saving ? 'Saving...' : 'Save Changes'}
                    </button>
                  </div>
                </div>
              ) : (
                /* Display Mode */
                <div className="grid grid-cols-2 gap-4 mb-6">
                  <div>
                    <label className="block text-sm font-medium" style={{ color: '#6b7280' }}>Company</label>
                    <p className="mt-1 text-sm" style={{ color: '#1f2937' }}>
                      {selectedReceipt.company?.name || 'Unassigned'}
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium" style={{ color: '#6b7280' }}>Amount</label>
                    <p className="mt-1 text-sm" style={{ color: '#1f2937' }}>
                      {selectedReceipt.amount ? `$${selectedReceipt.amount.toFixed(2)}` : 'N/A'}
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium" style={{ color: '#6b7280' }}>Date</label>
                    <p className="mt-1 text-sm" style={{ color: '#1f2937' }}>
                      {selectedReceipt.transaction_date || 'N/A'}
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium" style={{ color: '#6b7280' }}>Status</label>
                    <p className="mt-1">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          selectedReceipt.matched
                            ? 'bg-green-100 text-green-800'
                            : 'bg-yellow-100 text-yellow-800'
                        }`}
                      >
                        {selectedReceipt.matched ? 'Matched' : 'Unmatched'}
                      </span>
                    </p>
                  </div>
                  <div className="col-span-2">
                    <label className="block text-sm font-medium" style={{ color: '#6b7280' }}>Description</label>
                    <p className="mt-1 text-sm" style={{ color: '#1f2937' }}>
                      {selectedReceipt.description || 'N/A'}
                    </p>
                  </div>
                </div>
              )}

              {/* File Preview */}
              {selectedReceipt.file_url && (
                <div className="mt-6">
                  <label className="block text-sm font-medium mb-2" style={{ color: '#6b7280' }}>
                    Attachment
                  </label>
                  {loadingFileUrl ? (
                    <div className="flex items-center justify-center py-8">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                    </div>
                  ) : (signedFileUrl || selectedReceipt.file_url.startsWith('http')) ? (
                    selectedReceipt.file_type?.startsWith('image/') ? (
                      <img
                        src={signedFileUrl || selectedReceipt.file_url}
                        alt="Receipt"
                        className="max-w-full h-auto rounded border"
                      />
                    ) : (
                      <a
                        href={signedFileUrl || selectedReceipt.file_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
                      >
                        <svg
                          className="h-5 w-5 mr-2"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                          />
                        </svg>
                        Download {selectedReceipt.file_name}
                      </a>
                    )
                  ) : (
                    <p className="text-sm text-red-600">Unable to load attachment - file may not exist in storage</p>
                  )}
                </div>
              )}

              {/* Email Metadata */}
              <div className="mt-6 pt-6 border-t border-gray-200">
                <h3 className="text-sm font-medium mb-2" style={{ color: '#6b7280' }}>Email Details</h3>
                <dl className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2 text-sm">
                  <div>
                    <dt className="font-medium" style={{ color: '#6b7280' }}>From:</dt>
                    <dd style={{ color: '#1f2937' }}>{selectedReceipt.email_from}</dd>
                  </div>
                  <div>
                    <dt className="font-medium" style={{ color: '#6b7280' }}>Subject:</dt>
                    <dd style={{ color: '#1f2937' }}>{selectedReceipt.email_subject}</dd>
                  </div>
                  <div>
                    <dt className="font-medium" style={{ color: '#6b7280' }}>Received:</dt>
                    <dd style={{ color: '#1f2937' }}>
                      {selectedReceipt.email_received_at
                        ? format(new Date(selectedReceipt.email_received_at), 'PPpp')
                        : 'N/A'}
                    </dd>
                  </div>
                </dl>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
