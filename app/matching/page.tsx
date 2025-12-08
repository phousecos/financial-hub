// app/matching/page.tsx - Receipt to Transaction Matching Interface
'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type { Receipt, Transaction, Company } from '@/lib/types';
import { format } from 'date-fns';

interface ReceiptWithCompany extends Receipt {
  company?: Company;
}

interface MatchSuggestion {
  transaction_id: string;
  confidence: number;
  reasons: string[];
  transaction: {
    id: string;
    amount: number;
    transaction_date: string;
    description: string | null;
    payee: string | null;
    source: string;
  };
}

interface ExistingMatch {
  id: string;
  receipt_id: string;
  transaction_id: string;
  split_amount: number | null;
  matched_at: string;
  receipt?: Receipt;
  transaction?: Transaction;
}

export default function MatchingPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedCompany, setSelectedCompany] = useState<string>('');
  const [unmatchedReceipts, setUnmatchedReceipts] = useState<ReceiptWithCompany[]>([]);
  const [selectedReceipt, setSelectedReceipt] = useState<ReceiptWithCompany | null>(null);
  const [suggestions, setSuggestions] = useState<MatchSuggestion[]>([]);
  const [selectedTransactions, setSelectedTransactions] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [matching, setMatching] = useState(false);
  const [recentMatches, setRecentMatches] = useState<ExistingMatch[]>([]);
  const [showSplitMode, setShowSplitMode] = useState(false);
  const [previewReceipt, setPreviewReceipt] = useState<ReceiptWithCompany | null>(null);

  // Load companies on mount
  useEffect(() => {
    loadCompanies();
  }, []);

  // Load receipts when company changes
  useEffect(() => {
    if (selectedCompany) {
      loadUnmatchedReceipts();
      loadRecentMatches();
    }
  }, [selectedCompany]);

  async function loadCompanies() {
    const { data } = await supabase
      .from('companies')
      .select('*')
      .eq('active', true)
      .order('name');

    setCompanies(data || []);
    if (data && data.length > 0) {
      setSelectedCompany(data[0].id);
    }
    setLoading(false);
  }

  async function loadUnmatchedReceipts() {
    const { data } = await supabase
      .from('receipts')
      .select(`*, company:companies(*)`)
      .eq('company_id', selectedCompany)
      .eq('matched', false)
      .order('transaction_date', { ascending: false });

    setUnmatchedReceipts(data || []);
    setSelectedReceipt(null);
    setSuggestions([]);
    setSelectedTransactions(new Set());
  }

  async function loadRecentMatches() {
    const { data } = await supabase
      .from('transaction_receipts')
      .select(`
        *,
        receipt:receipts(*),
        transaction:transactions(*)
      `)
      .order('matched_at', { ascending: false })
      .limit(10);

    // Filter to only show matches for selected company
    const filtered = (data || []).filter(
      (m: ExistingMatch) => m.receipt?.company_id === selectedCompany
    );
    setRecentMatches(filtered);
  }

  const loadSuggestions = useCallback(async (receipt: ReceiptWithCompany) => {
    setLoadingSuggestions(true);
    setSuggestions([]);

    try {
      const response = await fetch(`/api/match/suggest?receipt_id=${receipt.id}`);
      const data = await response.json();

      if (data.success && data.suggestions[receipt.id]) {
        setSuggestions(data.suggestions[receipt.id]);
      }
    } catch (error) {
      console.error('Error loading suggestions:', error);
    } finally {
      setLoadingSuggestions(false);
    }
  }, []);

  function selectReceipt(receipt: ReceiptWithCompany) {
    setSelectedReceipt(receipt);
    setSelectedTransactions(new Set());
    setShowSplitMode(false);
    loadSuggestions(receipt);
  }

  function toggleTransactionSelection(txnId: string) {
    setSelectedTransactions(prev => {
      const newSet = new Set(prev);
      if (newSet.has(txnId)) {
        newSet.delete(txnId);
      } else {
        newSet.add(txnId);
      }
      return newSet;
    });
  }

  async function createMatch() {
    if (!selectedReceipt || selectedTransactions.size === 0) return;

    setMatching(true);
    try {
      const response = await fetch('/api/match/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          receipt_id: selectedReceipt.id,
          transaction_ids: Array.from(selectedTransactions),
        }),
      });

      const data = await response.json();

      if (data.success) {
        // Refresh data
        await loadUnmatchedReceipts();
        await loadRecentMatches();
        setSelectedReceipt(null);
        setSuggestions([]);
        setSelectedTransactions(new Set());
      } else {
        alert(data.error || 'Failed to create match');
      }
    } catch (error) {
      console.error('Error creating match:', error);
      alert('Error creating match');
    } finally {
      setMatching(false);
    }
  }

  async function removeMatch(matchId: string) {
    if (!confirm('Remove this match?')) return;

    try {
      const response = await fetch(`/api/match/${matchId}`, { method: 'DELETE' });
      const data = await response.json();

      if (data.success) {
        await loadUnmatchedReceipts();
        await loadRecentMatches();
      } else {
        alert(data.error || 'Failed to remove match');
      }
    } catch (error) {
      console.error('Error removing match:', error);
    }
  }

  function getConfidenceColor(confidence: number): string {
    if (confidence >= 70) return 'bg-green-100 text-green-800 border-green-200';
    if (confidence >= 50) return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    return 'bg-gray-100 text-gray-800 border-gray-200';
  }

  function getConfidenceBadge(confidence: number): string {
    if (confidence >= 70) return 'High';
    if (confidence >= 50) return 'Medium';
    return 'Low';
  }

  // Stats
  const stats = {
    unmatched: unmatchedReceipts.length,
    recentlyMatched: recentMatches.length,
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
      {/* Header */}
      <div className="sm:flex sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Match Receipts</h1>
          <p className="mt-2 text-sm text-gray-700">
            Match receipts to transactions for reconciliation
          </p>
        </div>
      </div>

      {/* Company Filter */}
      <div className="mt-6 bg-white shadow rounded-lg p-4">
        <div className="max-w-xs">
          <label htmlFor="company" className="block text-sm font-medium text-gray-700">
            Select Company
          </label>
          <select
            id="company"
            value={selectedCompany}
            onChange={(e) => setSelectedCompany(e.target.value)}
            className="mt-1 block w-full rounded-md border border-gray-300 bg-white py-2 px-3 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500 sm:text-sm text-gray-900"
          >
            {companies.map((company) => (
              <option key={company.id} value={company.id}>
                {company.name}
              </option>
            ))}
          </select>
        </div>

        {/* Stats */}
        <div className="mt-4 flex gap-6 text-sm">
          <div>
            <span className="text-gray-500">Unmatched Receipts:</span>{' '}
            <span className="font-semibold text-yellow-600">{stats.unmatched}</span>
          </div>
          <div>
            <span className="text-gray-500">Recently Matched:</span>{' '}
            <span className="font-semibold text-green-600">{stats.recentlyMatched}</span>
          </div>
        </div>
      </div>

      {/* Main Content - Two Column Layout */}
      <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column - Unmatched Receipts */}
        <div className="bg-white shadow rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
            <h2 className="text-lg font-medium text-gray-900">Unmatched Receipts</h2>
          </div>
          <div className="divide-y divide-gray-200 max-h-[600px] overflow-y-auto">
            {unmatchedReceipts.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="mt-2">All receipts matched!</p>
              </div>
            ) : (
              unmatchedReceipts.map((receipt) => (
                <div
                  key={receipt.id}
                  onClick={() => selectReceipt(receipt)}
                  className={`p-4 cursor-pointer hover:bg-gray-50 transition-colors ${
                    selectedReceipt?.id === receipt.id ? 'bg-blue-50 border-l-4 border-blue-500' : ''
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-lg font-semibold text-gray-900">
                          ${receipt.amount?.toFixed(2) || '—'}
                        </span>
                        {receipt.vendor && (
                          <span className="text-sm text-gray-600 truncate">
                            {receipt.vendor}
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-sm text-gray-600 truncate">
                        {receipt.description || 'No description'}
                      </p>
                      <p className="mt-1 text-xs text-gray-500">
                        {receipt.transaction_date
                          ? format(new Date(receipt.transaction_date), 'MMM d, yyyy')
                          : 'No date'}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {receipt.file_url && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setPreviewReceipt(receipt);
                          }}
                          className="text-blue-600 hover:text-blue-800"
                          title="Preview"
                        >
                          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </svg>
                        </button>
                      )}
                      <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right Column - Suggested Matches */}
        <div className="bg-white shadow rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
            <h2 className="text-lg font-medium text-gray-900">
              {selectedReceipt ? 'Suggested Transactions' : 'Select a Receipt'}
            </h2>
            {selectedReceipt && suggestions.length > 1 && (
              <button
                onClick={() => setShowSplitMode(!showSplitMode)}
                className={`text-sm px-3 py-1 rounded-md ${
                  showSplitMode
                    ? 'bg-blue-100 text-blue-800'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {showSplitMode ? 'Split Mode ON' : 'Enable Split Mode'}
              </button>
            )}
          </div>

          {!selectedReceipt ? (
            <div className="p-8 text-center text-gray-500">
              <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
              </svg>
              <p className="mt-2">Select a receipt to see matching suggestions</p>
            </div>
          ) : loadingSuggestions ? (
            <div className="p-8 text-center">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
              <p className="mt-2 text-gray-600">Finding matches...</p>
            </div>
          ) : suggestions.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="mt-2">No matching transactions found</p>
              <p className="mt-1 text-xs">Try importing more transactions or check the date/amount on the receipt</p>
            </div>
          ) : (
            <>
              <div className="divide-y divide-gray-200 max-h-[450px] overflow-y-auto">
                {suggestions.map((suggestion) => {
                  const isSelected = selectedTransactions.has(suggestion.transaction_id);
                  const txn = suggestion.transaction;

                  return (
                    <div
                      key={suggestion.transaction_id}
                      onClick={() => {
                        if (showSplitMode) {
                          toggleTransactionSelection(suggestion.transaction_id);
                        } else {
                          setSelectedTransactions(new Set([suggestion.transaction_id]));
                        }
                      }}
                      className={`p-4 cursor-pointer hover:bg-gray-50 transition-colors ${
                        isSelected ? 'bg-green-50 border-l-4 border-green-500' : ''
                      }`}
                    >
                      <div className="flex justify-between items-start">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className={`text-lg font-semibold ${
                              txn.amount < 0 ? 'text-red-600' : 'text-green-600'
                            }`}>
                              ${Math.abs(txn.amount).toFixed(2)}
                            </span>
                            <span className={`text-xs px-2 py-0.5 rounded-full border ${getConfidenceColor(suggestion.confidence)}`}>
                              {suggestion.confidence}% - {getConfidenceBadge(suggestion.confidence)}
                            </span>
                          </div>
                          <p className="mt-1 text-sm text-gray-600 truncate">
                            {txn.description || txn.payee || 'No description'}
                          </p>
                          <p className="mt-1 text-xs text-gray-500">
                            {format(new Date(txn.transaction_date), 'MMM d, yyyy')}
                            <span className="mx-2">|</span>
                            <span className="capitalize">{txn.source.replace('_', ' ')}</span>
                          </p>
                          {/* Match reasons */}
                          <div className="mt-2 flex flex-wrap gap-1">
                            {suggestion.reasons.map((reason, idx) => (
                              <span
                                key={idx}
                                className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded"
                              >
                                {reason}
                              </span>
                            ))}
                          </div>
                        </div>
                        <div className="ml-4">
                          {isSelected ? (
                            <svg className="h-6 w-6 text-green-600" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                            </svg>
                          ) : (
                            <div className="h-6 w-6 border-2 border-gray-300 rounded-full"></div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Match Action Bar */}
              {selectedTransactions.size > 0 && (
                <div className="p-4 bg-gray-50 border-t border-gray-200">
                  <div className="flex items-center justify-between">
                    <div className="text-sm text-gray-600">
                      {selectedTransactions.size === 1 ? (
                        'Ready to match 1 transaction'
                      ) : (
                        `Ready to match ${selectedTransactions.size} transactions (split)`
                      )}
                    </div>
                    <button
                      onClick={createMatch}
                      disabled={matching}
                      className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50"
                    >
                      {matching ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                          Matching...
                        </>
                      ) : (
                        <>
                          <svg className="h-4 w-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                          Match Now
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Recent Matches */}
      {recentMatches.length > 0 && (
        <div className="mt-8 bg-white shadow rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
            <h2 className="text-lg font-medium text-gray-900">Recent Matches</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Receipt</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Transaction</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Matched</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {recentMatches.map((match) => (
                  <tr key={match.id}>
                    <td className="px-4 py-3 text-sm">
                      <div className="font-medium text-gray-900">
                        ${match.receipt?.amount?.toFixed(2) || '—'}
                      </div>
                      <div className="text-gray-500 text-xs truncate max-w-[200px]">
                        {match.receipt?.description || match.receipt?.vendor || '—'}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <div className={`font-medium ${
                        (match.transaction?.amount || 0) < 0 ? 'text-red-600' : 'text-green-600'
                      }`}>
                        ${Math.abs(match.transaction?.amount || 0).toFixed(2)}
                      </div>
                      <div className="text-gray-500 text-xs truncate max-w-[200px]">
                        {match.transaction?.description || '—'}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {match.matched_at
                        ? format(new Date(match.matched_at), 'MMM d, h:mm a')
                        : '—'}
                    </td>
                    <td className="px-4 py-3 text-sm text-right">
                      <button
                        onClick={() => removeMatch(match.id)}
                        className="text-red-600 hover:text-red-800 text-xs"
                      >
                        Unmatch
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Receipt Preview Modal */}
      {previewReceipt && (
        <div
          className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center p-4 z-50"
          onClick={() => setPreviewReceipt(null)}
        >
          <div
            className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6">
              <div className="flex justify-between items-start mb-4">
                <h2 className="text-xl font-bold text-gray-900">Receipt Preview</h2>
                <button
                  onClick={() => setPreviewReceipt(null)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-4 text-sm">
                <div>
                  <span className="text-gray-500">Amount:</span>{' '}
                  <span className="font-semibold">${previewReceipt.amount?.toFixed(2) || '—'}</span>
                </div>
                <div>
                  <span className="text-gray-500">Date:</span>{' '}
                  <span className="font-semibold">
                    {previewReceipt.transaction_date
                      ? format(new Date(previewReceipt.transaction_date), 'MMM d, yyyy')
                      : '—'}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500">Vendor:</span>{' '}
                  <span className="font-semibold">{previewReceipt.vendor || '—'}</span>
                </div>
                <div>
                  <span className="text-gray-500">Description:</span>{' '}
                  <span className="font-semibold">{previewReceipt.description || '—'}</span>
                </div>
              </div>

              {previewReceipt.file_url && (
                <div className="mt-4">
                  {previewReceipt.file_type?.startsWith('image/') ? (
                    <img
                      src={previewReceipt.file_url}
                      alt="Receipt"
                      className="max-w-full h-auto rounded border"
                    />
                  ) : (
                    <iframe
                      src={previewReceipt.file_url}
                      className="w-full h-[500px] border rounded"
                      title="Receipt PDF"
                    />
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
