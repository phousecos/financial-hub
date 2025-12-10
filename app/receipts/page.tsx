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
        const url = await getReceiptUrl(selectedReceipt.file_url);
        setSignedFileUrl(url);
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

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  return (
    <div className="px-4 sm:px-0">
      <div className="sm:flex sm:items-center">
        <div className="sm:flex-auto">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Receipts</h1>
          <p className="mt-2 text-sm text-gray-700 dark:text-gray-300">
            All receipts received via email, organized by company.
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="mt-6 flex flex-col sm:flex-row gap-4">
        <div className="flex-1">
          <label htmlFor="company" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
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
          <label htmlFor="status" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
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
            <h3 className="mt-2 text-sm font-medium text-gray-900">No receipts</h3>
            <p className="mt-1 text-sm text-gray-500">
              Send an email to receipts@yourdomain.com to get started.
            </p>
            <p className="mt-1 text-xs text-gray-400">
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
                  <div className="text-2xl font-bold text-gray-900">
                    {receipt.amount ? `$${receipt.amount.toFixed(2)}` : 'No amount'}
                  </div>

                  {/* Description */}
                  <p className="mt-2 text-sm text-gray-600 line-clamp-2">
                    {receipt.description || 'No description'}
                  </p>

                  {/* Date */}
                  <p className="mt-2 text-xs text-gray-500">
                    {receipt.transaction_date
                      ? format(new Date(receipt.transaction_date), 'MMM d, yyyy')
                      : 'No date'}
                  </p>

                  {/* File Info */}
                  {receipt.file_name && (
                    <div className="mt-3 flex items-center text-xs text-gray-500">
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
                <h2 className="text-2xl font-bold text-gray-900">Receipt Details</h2>
                <button
                  onClick={() => setSelectedReceipt(null)}
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

              <div className="grid grid-cols-2 gap-4 mb-6">
                <div>
                  <label className="block text-sm font-medium text-gray-500">Company</label>
                  <p className="mt-1 text-sm text-gray-800">
                    {selectedReceipt.company?.name || 'Unassigned'}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-500">Amount</label>
                  <p className="mt-1 text-sm text-gray-800">
                    {selectedReceipt.amount ? `$${selectedReceipt.amount.toFixed(2)}` : 'N/A'}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-500">Date</label>
                  <p className="mt-1 text-sm text-gray-800">
                    {selectedReceipt.transaction_date || 'N/A'}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-500">Status</label>
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
                  <label className="block text-sm font-medium text-gray-500">Description</label>
                  <p className="mt-1 text-sm text-gray-800">
                    {selectedReceipt.description || 'N/A'}
                  </p>
                </div>
              </div>

              {/* File Preview */}
              {selectedReceipt.file_url && (
                <div className="mt-6">
                  <label className="block text-sm font-medium text-gray-500 mb-2">
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
                <h3 className="text-sm font-medium text-gray-500 mb-2">Email Details</h3>
                <dl className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2 text-sm">
                  <div>
                    <dt className="font-medium text-gray-500">From:</dt>
                    <dd className="text-gray-800">{selectedReceipt.email_from}</dd>
                  </div>
                  <div>
                    <dt className="font-medium text-gray-500">Subject:</dt>
                    <dd className="text-gray-800">{selectedReceipt.email_subject}</dd>
                  </div>
                  <div>
                    <dt className="font-medium text-gray-500">Received:</dt>
                    <dd className="text-gray-800">
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
