// app/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';

export default function Home() {
  const [stats, setStats] = useState({
    companies: 0,
    receipts: 0,
    unmatchedReceipts: 0,
    transactions: 0,
    unmatchedTransactions: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, []);

  async function loadStats() {
    try {
      const [
        { count: companiesCount },
        { count: receiptsCount },
        { count: unmatchedReceiptsCount },
        { count: transactionsCount },
        { count: unmatchedTransactionsCount },
      ] = await Promise.all([
        supabase.from('companies').select('*', { count: 'exact', head: true }),
        supabase.from('receipts').select('*', { count: 'exact', head: true }),
        supabase
          .from('receipts')
          .select('*', { count: 'exact', head: true })
          .eq('matched', false),
        supabase
          .from('transactions')
          .select('*', { count: 'exact', head: true }),
        supabase
          .from('transactions')
          .select('*', { count: 'exact', head: true })
          .eq('receipt_matched', false),
      ]);

      setStats({
        companies: companiesCount || 0,
        receipts: receiptsCount || 0,
        unmatchedReceipts: unmatchedReceiptsCount || 0,
        transactions: transactionsCount || 0,
        unmatchedTransactions: unmatchedTransactionsCount || 0,
      });
    } catch (error) {
      console.error('Error loading stats:', error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="px-4 sm:px-0">
      <h1 className="text-3xl font-bold text-gray-900 mb-8">Dashboard</h1>

      {loading ? (
        <div className="text-center py-12">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {/* Companies */}
          <Link
            href="/companies"
            className="bg-white overflow-hidden shadow rounded-lg hover:shadow-md transition-shadow"
          >
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <svg
                    className="h-6 w-6 text-gray-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                    />
                  </svg>
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">
                      Companies
                    </dt>
                    <dd className="text-3xl font-semibold text-gray-900">
                      {stats.companies}
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
          </Link>

          {/* Receipts */}
          <Link
            href="/receipts"
            className="bg-white overflow-hidden shadow rounded-lg hover:shadow-md transition-shadow"
          >
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <svg
                    className="h-6 w-6 text-gray-400"
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
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">
                      Receipts
                    </dt>
                    <dd className="flex items-baseline">
                      <div className="text-3xl font-semibold text-gray-900">
                        {stats.receipts}
                      </div>
                      {stats.unmatchedReceipts > 0 && (
                        <div className="ml-2 text-sm text-red-600">
                          {stats.unmatchedReceipts} unmatched
                        </div>
                      )}
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
          </Link>

          {/* Transactions */}
          <Link
            href="/transactions"
            className="bg-white overflow-hidden shadow rounded-lg hover:shadow-md transition-shadow"
          >
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <svg
                    className="h-6 w-6 text-gray-400"
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
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">
                      Transactions
                    </dt>
                    <dd className="flex items-baseline">
                      <div className="text-3xl font-semibold text-gray-900">
                        {stats.transactions}
                      </div>
                      {stats.unmatchedTransactions > 0 && (
                        <div className="ml-2 text-sm text-red-600">
                          {stats.unmatchedTransactions} unmatched
                        </div>
                      )}
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
          </Link>
        </div>
      )}

      {/* Quick Actions */}
      <div className="mt-8">
        <h2 className="text-lg font-medium text-gray-900 mb-4">Quick Actions</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Link
            href="/companies"
            className="bg-blue-50 border-2 border-blue-200 rounded-lg p-4 hover:bg-blue-100 transition-colors"
          >
            <div className="text-sm font-medium text-blue-900">
              Add Company
            </div>
            <div className="mt-1 text-xs text-blue-700">
              Set up a new company entity
            </div>
          </Link>

          <Link
            href="/transactions/import"
            className="bg-green-50 border-2 border-green-200 rounded-lg p-4 hover:bg-green-100 transition-colors"
          >
            <div className="text-sm font-medium text-green-900">
              Import Amex CSV
            </div>
            <div className="mt-1 text-xs text-green-700">
              Upload transactions from Amex
            </div>
          </Link>

          <Link
            href="/matching"
            className="bg-purple-50 border-2 border-purple-200 rounded-lg p-4 hover:bg-purple-100 transition-colors"
          >
            <div className="text-sm font-medium text-purple-900">
              Match Receipts
            </div>
            <div className="mt-1 text-xs text-purple-700">
              Link receipts to transactions
            </div>
          </Link>

          <Link
            href="/sync"
            className="bg-orange-50 border-2 border-orange-200 rounded-lg p-4 hover:bg-orange-100 transition-colors"
          >
            <div className="text-sm font-medium text-orange-900">
              Sync to QB
            </div>
            <div className="mt-1 text-xs text-orange-700">
              Push matched transactions
            </div>
          </Link>
        </div>
      </div>

      {/* Setup Status */}
      {stats.companies === 0 && (
        <div className="mt-8 bg-yellow-50 border-l-4 border-yellow-400 p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg
                className="h-5 w-5 text-yellow-400"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
            <div className="ml-3">
              <p className="text-sm text-yellow-700">
                <strong>Get Started:</strong> Add your companies first to begin
                tracking receipts and transactions.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
