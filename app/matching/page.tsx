// app/matching/page.tsx - Transaction to Receipt Matching Interface
'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type { Receipt, Transaction, Company } from '@/lib/types';
import { format } from 'date-fns';

interface TransactionWithCompany extends Transaction {
  company?: Company;
}

interface ReceiptSuggestion {
  receipt_id: string;
  confidence: number;
  reasons: string[];
  receipt: {
    id: string;
    amount: number | null;
    transaction_date: string | null;
    description: string | null;
    vendor: string | null;
    file_url: string | null;
    file_type: string | null;
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
  const [transactions, setTransactions] = useState<TransactionWithCompany[]>([]);
  const [matchStatusFilter, setMatchStatusFilter] = useState<'all' | 'matched' | 'unmatched' | 'no_receipt'>('unmatched');
  const [selectedTransaction, setSelectedTransaction] = useState<TransactionWithCompany | null>(null);
  const [suggestions, setSuggestions] = useState<ReceiptSuggestion[]>([]);
  const [selectedReceipt, setSelectedReceipt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [matching, setMatching] = useState(false);
  const [recentMatches, setRecentMatches] = useState<ExistingMatch[]>([]);
  const [previewReceipt, setPreviewReceipt] = useState<ReceiptSuggestion['receipt'] | null>(null);
  const [transactionCounts, setTransactionCounts] = useState({ all: 0, matched: 0, unmatched: 0, no_receipt: 0 });

  // Load companies on mount
  useEffect(() => {
    loadCompanies();
  }, []);

  // Load transactions when company or filter changes
  useEffect(() => {
    if (selectedCompany) {
      loadTransactions();
      loadTransactionCounts();
      loadRecentMatches();
    }
  }, [selectedCompany, matchStatusFilter]);

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

  async function loadTransactions() {
    let query = supabase
      .from('transactions')
      .select(`*, company:companies(*)`)
      .eq('company_id', selectedCompany)
      .order('transaction_date', { ascending: false });

    // Apply match status filter
    if (matchStatusFilter === 'matched') {
      query = query.eq('receipt_matched', true);
    } else if (matchStatusFilter === 'unmatched') {
      query = query.eq('receipt_matched', false).eq('no_receipt_needed', false);
    } else if (matchStatusFilter === 'no_receipt') {
      query = query.eq('no_receipt_needed', true);
    }

    const { data } = await query;
    setTransactions(data || []);
    setSelectedTransaction(null);
    setSuggestions([]);
    setSelectedReceipt(null);
  }

  async function loadTransactionCounts() {
    // Get all transactions for this company to calculate counts
    const { data } = await supabase
      .from('transactions')
      .select('receipt_matched, no_receipt_needed')
      .eq('company_id', selectedCompany);

    if (data) {
      const matched = data.filter(t => t.receipt_matched).length;
      const noReceipt = data.filter(t => t.no_receipt_needed).length;
      const unmatched = data.filter(t => !t.receipt_matched && !t.no_receipt_needed).length;
      setTransactionCounts({
        all: data.length,
        matched,
        unmatched,
        no_receipt: noReceipt,
      });
    }
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
      (m: ExistingMatch) => m.transaction?.company_id === selectedCompany
    );
    setRecentMatches(filtered);
  }

  const loadSuggestions = useCallback(async (transaction: TransactionWithCompany) => {
    setLoadingSuggestions(true);
    setSuggestions([]);

    try {
      const response = await fetch(`/api/match/suggest-receipts?transaction_id=${transaction.id}`);
      const data = await response.json();

      if (data.success && data.suggestions) {
        setSuggestions(data.suggestions);
      }
    } catch (error) {
      console.error('Error loading suggestions:', error);
    } finally {
      setLoadingSuggestions(false);
    }
  }, []);

  function selectTransaction(transaction: TransactionWithCompany) {
    setSelectedTransaction(transaction);
    setSelectedReceipt(null);
    loadSuggestions(transaction);
  }

  async function createMatch() {
    if (!selectedTransaction || !selectedReceipt) return;

    setMatching(true);
    try {
      const response = await fetch('/api/match/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          receipt_id: selectedReceipt,
          transaction_ids: [selectedTransaction.id],
        }),
      });

      const data = await response.json();

      if (data.success) {
        // Refresh data
        await loadTransactions();
        await loadTransactionCounts();
        await loadRecentMatches();
        setSelectedTransaction(null);
        setSuggestions([]);
        setSelectedReceipt(null);
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

  async function markNoReceipt(transaction: TransactionWithCompany, noReceiptNeeded: boolean) {
    try {
      const response = await fetch('/api/transactions/no-receipt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transaction_id: transaction.id,
          no_receipt_needed: noReceiptNeeded,
        }),
      });

      const data = await response.json();

      if (data.success) {
        // Refresh data
        await loadTransactions();
        await loadTransactionCounts();
        setSelectedTransaction(null);
        setSuggestions([]);
      } else {
        alert(data.error || 'Failed to update transaction');
      }
    } catch (error) {
      console.error('Error updating transaction:', error);
      alert('Error updating transaction');
    }
  }

  async function removeMatch(matchId: string) {
    if (!confirm('Remove this match?')) return;

    try {
      const response = await fetch(`/api/match/${matchId}`, { method: 'DELETE' });
      const data = await response.json();

      if (data.success) {
        await loadTransactions();
        await loadTransactionCounts();
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
    showing: transactions.length,
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
            Match transactions to receipts for reconciliation
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="mt-6 bg-white shadow rounded-lg p-4">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1 max-w-xs">
            <label htmlFor="company" className="block text-sm font-medium text-gray-700">
              Company
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

          <div className="flex-1 max-w-xs">
            <label htmlFor="matchStatus" className="block text-sm font-medium text-gray-700">
              Transaction Status
            </label>
            <select
              id="matchStatus"
              value={matchStatusFilter}
              onChange={(e) => setMatchStatusFilter(e.target.value as 'all' | 'matched' | 'unmatched' | 'no_receipt')}
              className="mt-1 block w-full rounded-md border border-gray-300 bg-white py-2 px-3 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500 sm:text-sm text-gray-900"
            >
              <option value="all">All Transactions ({transactionCounts.all})</option>
              <option value="unmatched">Needs Receipt ({transactionCounts.unmatched})</option>
              <option value="matched">Has Receipt ({transactionCounts.matched})</option>
              <option value="no_receipt">No Receipt Needed ({transactionCounts.no_receipt})</option>
            </select>
          </div>
        </div>

        {/* Stats */}
        <div className="mt-4 flex flex-wrap gap-4 text-sm">
          <div className="flex items-center gap-2">
            <span className="inline-block w-3 h-3 rounded-full bg-yellow-400"></span>
            <span className="text-gray-600">Needs Receipt:</span>
            <span className="font-semibold text-yellow-600">{transactionCounts.unmatched}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-block w-3 h-3 rounded-full bg-green-400"></span>
            <span className="text-gray-600">Has Receipt:</span>
            <span className="font-semibold text-green-600">{transactionCounts.matched}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-block w-3 h-3 rounded-full bg-gray-400"></span>
            <span className="text-gray-600">No Receipt Needed:</span>
            <span className="font-semibold text-gray-600">{transactionCounts.no_receipt}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-gray-600">Showing:</span>
            <span className="font-semibold text-gray-900">{stats.showing}</span>
          </div>
        </div>
      </div>

      {/* Main Content - Two Column Layout */}
      <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column - Transactions */}
        <div className="bg-white shadow rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
            <h2 className="text-lg font-medium text-gray-900">
              {matchStatusFilter === 'all' ? 'All Transactions' :
               matchStatusFilter === 'matched' ? 'Transactions with Receipts' :
               matchStatusFilter === 'no_receipt' ? 'No Receipt Needed' : 'Transactions Needing Receipts'}
            </h2>
          </div>
          <div className="divide-y divide-gray-200 max-h-[600px] overflow-y-auto">
            {transactions.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="mt-2">
                  {matchStatusFilter === 'unmatched' ? 'All transactions have receipts!' :
                   matchStatusFilter === 'matched' ? 'No transactions with receipts yet' :
                   matchStatusFilter === 'no_receipt' ? 'No transactions marked as no receipt needed' : 'No transactions found'}
                </p>
              </div>
            ) : (
              transactions.map((transaction) => (
                <div
                  key={transaction.id}
                  onClick={() => selectTransaction(transaction)}
                  className={`p-4 cursor-pointer hover:bg-gray-50 transition-colors ${
                    selectedTransaction?.id === transaction.id ? 'bg-blue-50 border-l-4 border-blue-500' : ''
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`text-lg font-semibold ${
                          transaction.amount < 0 ? 'text-red-600' : 'text-green-600'
                        }`}>
                          ${Math.abs(transaction.amount).toFixed(2)}
                        </span>
                        {transaction.payee && (
                          <span className="text-sm text-gray-600 truncate">
                            {transaction.payee}
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-sm text-gray-600 truncate">
                        {transaction.description || 'No description'}
                      </p>
                      <div className="mt-1 flex items-center gap-2">
                        <span className="text-xs text-gray-500">
                          {format(new Date(transaction.transaction_date), 'MMM d, yyyy')}
                        </span>
                        <span className="text-xs text-gray-400 capitalize">
                          {transaction.source.replace('_', ' ')}
                        </span>
                        {matchStatusFilter === 'all' && (
                          <span className={`text-xs px-1.5 py-0.5 rounded ${
                            transaction.receipt_matched
                              ? 'bg-green-100 text-green-700'
                              : transaction.no_receipt_needed
                              ? 'bg-gray-100 text-gray-700'
                              : 'bg-yellow-100 text-yellow-700'
                          }`}>
                            {transaction.receipt_matched ? 'Has Receipt' :
                             transaction.no_receipt_needed ? 'No Receipt' : 'Needs Receipt'}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
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

        {/* Right Column - Receipts */}
        <div className="bg-white shadow rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
            <h2 className="text-lg font-medium text-gray-900">
              {selectedTransaction ? 'Available Receipts' : 'Select a Transaction'}
            </h2>
          </div>

          {!selectedTransaction ? (
            <div className="p-8 text-center text-gray-500">
              <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
              </svg>
              <p className="mt-2">Select a transaction to see matching receipts</p>
            </div>
          ) : loadingSuggestions ? (
            <div className="p-8 text-center">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
              <p className="mt-2 text-gray-600">Finding receipts...</p>
            </div>
          ) : (
            <>
              {/* No Receipt Option */}
              {!selectedTransaction.receipt_matched && !selectedTransaction.no_receipt_needed && (
                <div className="p-4 border-b border-gray-200 bg-gray-50">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={false}
                      onChange={() => markNoReceipt(selectedTransaction, true)}
                      className="h-5 w-5 text-gray-600 rounded border-gray-300 focus:ring-gray-500"
                    />
                    <div>
                      <span className="text-sm font-medium text-gray-700">No Receipt Needed</span>
                      <p className="text-xs text-gray-500">Check this if this transaction does not require a receipt</p>
                    </div>
                  </label>
                </div>
              )}

              {selectedTransaction.no_receipt_needed && (
                <div className="p-4 border-b border-gray-200 bg-gray-100">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={true}
                      onChange={() => markNoReceipt(selectedTransaction, false)}
                      className="h-5 w-5 text-gray-600 rounded border-gray-300 focus:ring-gray-500"
                    />
                    <div>
                      <span className="text-sm font-medium text-gray-700">No Receipt Needed</span>
                      <p className="text-xs text-gray-500">Uncheck to require a receipt for this transaction</p>
                    </div>
                  </label>
                </div>
              )}

              {suggestions.length === 0 && !selectedTransaction.no_receipt_needed ? (
                <div className="p-8 text-center text-gray-500">
                  <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="mt-2">No matching receipts found</p>
                  <p className="mt-1 text-xs">Upload more receipts or use the &quot;No Receipt Needed&quot; option above</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-200 max-h-[450px] overflow-y-auto">
                  {suggestions.map((suggestion) => {
                    const isSelected = selectedReceipt === suggestion.receipt_id;
                    const receipt = suggestion.receipt;

                    return (
                      <div
                        key={suggestion.receipt_id}
                        onClick={() => setSelectedReceipt(suggestion.receipt_id)}
                        className={`p-4 cursor-pointer hover:bg-gray-50 transition-colors ${
                          isSelected ? 'bg-green-50 border-l-4 border-green-500' : ''
                        }`}
                      >
                        <div className="flex justify-between items-start">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-lg font-semibold text-gray-900">
                                ${receipt.amount?.toFixed(2) || '—'}
                              </span>
                              <span className={`text-xs px-2 py-0.5 rounded-full border ${getConfidenceColor(suggestion.confidence)}`}>
                                {suggestion.confidence}% - {getConfidenceBadge(suggestion.confidence)}
                              </span>
                            </div>
                            <p className="mt-1 text-sm text-gray-600 truncate">
                              {receipt.vendor || receipt.description || 'No description'}
                            </p>
                            <p className="mt-1 text-xs text-gray-500">
                              {receipt.transaction_date
                                ? format(new Date(receipt.transaction_date), 'MMM d, yyyy')
                                : 'No date'}
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
                          <div className="ml-4 flex items-center gap-2">
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
              )}

              {/* Match Action Bar */}
              {selectedReceipt && (
                <div className="p-4 bg-gray-50 border-t border-gray-200">
                  <div className="flex items-center justify-between">
                    <div className="text-sm text-gray-600">
                      Ready to match selected receipt
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
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Transaction</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Receipt</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Matched</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {recentMatches.map((match) => (
                  <tr key={match.id}>
                    <td className="px-4 py-3 text-sm">
                      <div className={`font-medium ${
                        (match.transaction?.amount || 0) < 0 ? 'text-red-600' : 'text-green-600'
                      }`}>
                        ${Math.abs(match.transaction?.amount || 0).toFixed(2)}
                      </div>
                      <div className="text-gray-500 text-xs truncate max-w-[200px]">
                        {match.transaction?.description || match.transaction?.payee || '—'}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <div className="font-medium text-gray-900">
                        ${match.receipt?.amount?.toFixed(2) || '—'}
                      </div>
                      <div className="text-gray-500 text-xs truncate max-w-[200px]">
                        {match.receipt?.vendor || match.receipt?.description || '—'}
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
