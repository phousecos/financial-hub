// app/transactions/page.tsx - Transactions List
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import type { Transaction, Company, BankAccount } from '@/lib/types';
import { format } from 'date-fns';

interface TransactionWithDetails extends Transaction {
  company?: Company;
  bank_account?: BankAccount;
}

export default function TransactionsPage() {
  const router = useRouter();
  const [transactions, setTransactions] = useState<TransactionWithDetails[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [allTransactions, setAllTransactions] = useState<TransactionWithDetails[]>([]);
  
  // Filters
  const [selectedCompany, setSelectedCompany] = useState<string>('all');
  const [matchedFilter, setMatchedFilter] = useState<'all' | 'matched' | 'unmatched'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  useEffect(() => {
    loadCompanies();
    loadTransactions();
  }, [selectedCompany, matchedFilter, dateFrom, dateTo]);

  useEffect(() => {
  // Apply client-side search filter
  let filtered = allTransactions;
  
  if (searchTerm) {
    const term = searchTerm.toLowerCase();
    filtered = filtered.filter(txn => 
      txn.description?.toLowerCase().includes(term) ||
      txn.payee?.toLowerCase().includes(term) ||
      txn.amount.toString().includes(term)
    );
  }
  
  setTransactions(filtered);
}, [searchTerm, allTransactions]);
  async function loadCompanies() {
    const { data } = await supabase
      .from('companies')
      .select('*')
      .order('name');
    
    setCompanies(data || []);
  }

  async function loadTransactions() {
    try {
      let query = supabase
        .from('transactions')
        .select(`
          *,
          company:companies(*),
          bank_account:bank_accounts(*)
        `)
        .order('transaction_date', { ascending: false });

      // Apply filters
      if (selectedCompany !== 'all') {
        query = query.eq('company_id', selectedCompany);
      }

      if (matchedFilter === 'matched') {
        query = query.eq('receipt_matched', true);
      } else if (matchedFilter === 'unmatched') {
        query = query.eq('receipt_matched', false);
      }

      if (dateFrom) {
        query = query.gte('transaction_date', dateFrom);
      }

      if (dateTo) {
        query = query.lte('transaction_date', dateTo);
      }

      const { data, error } = await query;

      if (error) throw error;

      setAllTransactions(data || []);
    } catch (error) {
      console.error('Error loading transactions:', error);
    } finally {
      setLoading(false);
    }
  }

  async function deleteTransaction(id: string) {
    if (!confirm('Delete this transaction? This cannot be undone.')) return;

    try {
      const { error } = await supabase
        .from('transactions')
        .delete()
        .eq('id', id);

      if (error) throw error;
      await loadTransactions();
    } catch (error) {
      console.error('Error deleting transaction:', error);
      alert('Error deleting transaction');
    }
  }

  // Calculate stats
  const stats = {
    total: transactions.length,
    unmatched: transactions.filter(t => !t.receipt_matched).length,
    totalAmount: transactions.reduce((sum, t) => sum + t.amount, 0),
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
          <h1 className="text-3xl font-bold text-gray-900">Transactions</h1>
          <p className="mt-2 text-sm text-gray-700">
            All imported transactions from Amex and bank feeds
          </p>
        </div>
        <button
          onClick={() => router.push('/transactions/import')}
          className="mt-4 sm:mt-0 inline-flex items-center justify-center rounded-md border border-transparent bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        >
          Import Amex CSV
        </button>
      </div>

      {/* Stats */}
      <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-3">
        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="text-sm font-medium text-gray-500">Total Transactions</div>
            <div className="mt-1 text-3xl font-semibold text-gray-900">{stats.total}</div>
          </div>
        </div>

        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="text-sm font-medium text-gray-500">Unmatched</div>
            <div className="mt-1 text-3xl font-semibold text-yellow-600">{stats.unmatched}</div>
          </div>
        </div>

        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="text-sm font-medium text-gray-500">Total Amount</div>
            <div className={`mt-1 text-3xl font-semibold ${
              stats.totalAmount < 0 ? 'text-red-600' : 'text-green-600'
            }`}>
              ${Math.abs(stats.totalAmount).toFixed(2)}
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="mt-6 bg-white shadow rounded-lg p-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {/* Company Filter */}
          <div>
            <label htmlFor="company" className="block text-sm font-medium text-gray-700">
              Company
            </label>
            <select
              id="company"
              value={selectedCompany}
              onChange={(e) => setSelectedCompany(e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 bg-white py-2 px-3 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500 sm:text-sm text-gray-900"
            >
              <option value="all">All Companies</option>
              {companies.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.name}
                </option>
              ))}
            </select>
          </div>

          {/* Matched Filter */}
          <div>
            <label htmlFor="matched" className="block text-sm font-medium text-gray-700">
              Status
            </label>
            <select
              id="matched"
              value={matchedFilter}
              onChange={(e) => setMatchedFilter(e.target.value as any)}
              className="mt-1 block w-full rounded-md border border-gray-300 bg-white py-2 px-3 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500 sm:text-sm text-gray-900"
            >
              <option value="all">All Transactions</option>
              <option value="unmatched">Unmatched Only</option>
              <option value="matched">Matched Only</option>
            </select>
          </div>

          {/* Date From */}
          <div>
            <label htmlFor="dateFrom" className="block text-sm font-medium text-gray-700">
              From Date
            </label>
            <input
              type="date"
              id="dateFrom"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 bg-white py-2 px-3 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500 sm:text-sm text-gray-900"
            />
          </div>

          {/* Date To */}
          <div>
            <label htmlFor="dateTo" className="block text-sm font-medium text-gray-700">
              To Date
            </label>
            <input
              type="date"
              id="dateTo"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 bg-white py-2 px-3 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500 sm:text-sm text-gray-900"
            />
          </div>

          {/* Search */}
          <div>
            <label htmlFor="search" className="block text-sm font-medium text-gray-700">
              Search
            </label>
            <input
              type="text"
              id="search"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Description, payee, amount..."
              className="mt-1 block w-full rounded-md border border-gray-300 bg-white py-2 px-3 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500 sm:text-sm text-gray-900"
            />
          </div>
        </div>

        {/* Clear Filters */}
        {(selectedCompany !== 'all' || matchedFilter !== 'all' || searchTerm || dateFrom || dateTo) && (
          <div className="mt-3">
            <button
              onClick={() => {
                setSelectedCompany('all');
                setMatchedFilter('all');
                setSearchTerm('');
                setDateFrom('');
                setDateTo('');
              }}
              className="text-sm text-blue-600 hover:text-blue-800"
            >
              Clear all filters
            </button>
          </div>
        )}
      </div>

      {/* Transactions Table */}
      <div className="mt-6 flex flex-col">
        <div className="-my-2 -mx-4 overflow-x-auto sm:-mx-6 lg:-mx-8">
          <div className="inline-block min-w-full py-2 align-middle md:px-6 lg:px-8">
            {transactions.length === 0 ? (
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
                    d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <h3 className="mt-2 text-sm font-medium text-gray-900">No transactions</h3>
                <p className="mt-1 text-sm text-gray-500">
                  Get started by importing an Amex CSV file.
                </p>
                <div className="mt-6">
                  <button
                    onClick={() => router.push('/transactions/import')}
                    className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
                  >
                    Import CSV
                  </button>
                </div>
              </div>
            ) : (
              <div className="overflow-hidden shadow ring-1 ring-black ring-opacity-5 md:rounded-lg">
                <table className="min-w-full divide-y divide-gray-300">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900">
                        Date
                      </th>
                      <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                        Company
                      </th>
                      <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                        Description
                      </th>
                      <th className="px-3 py-3.5 text-right text-sm font-semibold text-gray-900">
                        Amount
                      </th>
                      <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                        Status
                      </th>
                      <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                        Source
                      </th>
                      <th className="relative py-3.5 pl-3 pr-4 sm:pr-6">
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white">
                    {transactions.map((txn) => (
                      <tr key={txn.id}>
                        <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm text-gray-900">
                          {format(new Date(txn.transaction_date), 'MMM d, yyyy')}
                        </td>
                        <td className="px-3 py-4 text-sm text-gray-900">
                          {txn.company?.name || 'Unknown'}
                        </td>
                        <td className="px-3 py-4 text-sm text-gray-600 max-w-md truncate">
                          {txn.description}
                        </td>
                        <td className={`whitespace-nowrap px-3 py-4 text-sm text-right font-medium ${
                          txn.amount < 0 ? 'text-red-600' : 'text-green-600'
                        }`}>
                          ${Math.abs(txn.amount).toFixed(2)}
                        </td>
                        <td className="whitespace-nowrap px-3 py-4 text-sm">
                          <span
                            className={`inline-flex rounded-full px-2 text-xs font-semibold leading-5 ${
                              txn.receipt_matched
                                ? 'bg-green-100 text-green-800'
                                : 'bg-yellow-100 text-yellow-800'
                            }`}
                          >
                            {txn.receipt_matched ? 'Matched' : 'Unmatched'}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-3 py-4 text-xs text-gray-500">
                          {txn.source === 'amex_import' ? 'Amex CSV' :
                           txn.source === 'bank_feed' ? 'Bank Feed' :
                           txn.source === 'qb_pull' ? 'QuickBooks' : 'Manual'}
                        </td>
                        <td className="relative whitespace-nowrap py-4 pl-3 pr-4 text-right text-sm font-medium sm:pr-6">
                          <button
                            onClick={() => deleteTransaction(txn.id)}
                            className="text-red-600 hover:text-red-900"
                          >
                            Delete
                          </button>
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