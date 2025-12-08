// app/transactions/import/page.tsx - Amex CSV Import
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import Papa from 'papaparse';
import type { Company, AmexCSVRow } from '@/lib/types';

interface ParsedTransaction {
  date: string;
  description: string;
  amount: number;
  reference: string;
  status: string;
}

export default function ImportPage() {
  const router = useRouter();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedCompany, setSelectedCompany] = useState<string>('');
  const [file, setFile] = useState<File | null>(null);
  const [parsedData, setParsedData] = useState<ParsedTransaction[]>([]);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadCompanies();
  }, []);

  async function loadCompanies() {
    const { data } = await supabase
      .from('companies')
      .select('*')
      .eq('active', true)
      .order('name');
    
    setCompanies(data || []);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    if (!selectedFile.name.endsWith('.csv')) {
      setError('Please select a CSV file');
      return;
    }

    setFile(selectedFile);
    setError(null);
    parseCSV(selectedFile);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile && droppedFile.name.endsWith('.csv')) {
      setFile(droppedFile);
      setError(null);
      parseCSV(droppedFile);
    } else {
      setError('Please drop a CSV file');
    }
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
  }

  function parseCSV(file: File) {
    Papa.parse<AmexCSVRow>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const transactions: ParsedTransaction[] = results.data
          .filter(row => row.Status === 'Posted')
          .map(row => ({
            date: row.Date,
            description: row.Description,
            amount: parseFloat(row.Amount.replace(/,/g, '')),
            reference: row.Reference,
            status: row.Status,
          }));

        setParsedData(transactions);
        setError(null);
      },
      error: (error) => {
        setError(`Error parsing CSV: ${error.message}`);
        setParsedData([]);
      },
    });
  }

  async function handleImport() {
    if (!selectedCompany) {
      setError('Please select a company');
      return;
    }

    if (parsedData.length === 0) {
      setError('No transactions to import');
      return;
    }

    setImporting(true);
    setError(null);

    try {
      let imported = 0;
      let duplicates = 0;

      // Get or create bank account
      let { data: bankAccount } = await supabase
        .from('bank_accounts')
        .select('id')
        .eq('company_id', selectedCompany)
        .eq('account_type', 'credit_card')
        .single();

      if (!bankAccount) {
        const { data: newAccount, error: accountError } = await supabase
          .from('bank_accounts')
          .insert([{
            company_id: selectedCompany,
            account_name: 'American Express',
            account_type: 'credit_card',
          }])
          .select()
          .single();

        if (accountError) throw accountError;
        bankAccount = newAccount;
      }

      if (!bankAccount) {
        throw new Error('Failed to get or create bank account');
      }

      const accountId = bankAccount.id;

      // Import transactions
      for (const txn of parsedData) {
        const { data: existing } = await supabase
          .from('transactions')
          .select('id')
          .eq('company_id', selectedCompany)
          .eq('external_ref', txn.reference)
          .eq('source', 'amex_import')
          .single();

        if (existing) {
          duplicates++;
          continue;
        }

        const { error: insertError } = await supabase
          .from('transactions')
          .insert([{
            company_id: selectedCompany,
            bank_account_id: accountId,
            amount: txn.amount,
            transaction_date: txn.date,
            posted_date: txn.date,
            payee: null,
            description: txn.description,
            external_ref: txn.reference,
            source: 'amex_import',
            status: 'unmatched',
            needs_qb_push: true,
            receipt_matched: false,
          }]);

        if (insertError) {
          console.error('Error inserting transaction:', insertError);
          continue;
        }

        imported++;
      }

      alert(`Import complete!\nImported: ${imported}\nDuplicates skipped: ${duplicates}`);
      setTimeout(() => router.push('/transactions'), 1500);

    } catch (error: any) {
      console.error('Import error:', error);
      setError(`Import failed: ${error.message}`);
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="px-4 sm:px-0 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Import Amex CSV</h1>
        <p className="mt-2 text-sm text-gray-700">
          Upload your American Express CSV to import transactions
        </p>
      </div>

      {error && (
        <div className="mb-6 bg-red-50 border-l-4 border-red-400 p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-red-400" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white shadow sm:rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <div className="space-y-6">
            {/* Step 1: Select Company */}
            <div>
              <label htmlFor="company" className="block text-sm font-medium text-gray-700">
                1. Select Company *
              </label>
              <select
                id="company"
                value={selectedCompany}
                onChange={(e) => setSelectedCompany(e.target.value)}
                className="mt-1 block w-full rounded-md border border-gray-300 bg-white py-2 px-3 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500 sm:text-sm text-gray-900"
              >
                <option value="">-- Select a company --</option>
                {companies.map((company) => (
                  <option key={company.id} value={company.id}>
                    {company.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Step 2: Upload CSV */}
            <div>
              <label htmlFor="file" className="block text-sm font-medium text-gray-700">
                2. Upload Amex CSV *
              </label>
              <div 
                className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-md hover:border-blue-400 transition-colors"
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragEnter={handleDragOver}
              >
                <div className="space-y-1 text-center">
                  <svg
                    className="mx-auto h-12 w-12 text-gray-400"
                    stroke="currentColor"
                    fill="none"
                    viewBox="0 0 48 48"
                  >
                    <path
                      d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02"
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  <div className="flex text-sm text-gray-600">
                    <label
                      htmlFor="file-upload"
                      className="relative cursor-pointer bg-white rounded-md font-medium text-blue-600 hover:text-blue-500"
                    >
                      <span>Upload a file</span>
                      <input
                        id="file-upload"
                        name="file-upload"
                        type="file"
                        accept=".csv"
                        onChange={handleFileChange}
                        className="sr-only"
                      />
                    </label>
                    <p className="pl-1">or drag and drop</p>
                  </div>
                  <p className="text-xs text-gray-500">CSV files only</p>
                  {file && (
                    <p className="text-sm text-green-600 font-medium mt-2">
                      ✓ {file.name}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Preview */}
            {parsedData.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-2">
                  3. Preview ({parsedData.length} transactions)
                </h3>
                <div className="border border-gray-200 rounded-md overflow-hidden">
                  <div className="max-h-64 overflow-y-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                            Date
                          </th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                            Description
                          </th>
                          <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                            Amount
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {parsedData.slice(0, 10).map((txn, idx) => (
                          <tr key={idx}>
                            <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-900">
                              {txn.date}
                            </td>
                            <td className="px-3 py-2 text-sm text-gray-600 truncate max-w-xs">
                              {txn.description}
                            </td>
                            <td className={`px-3 py-2 whitespace-nowrap text-sm text-right font-medium ${
                              txn.amount < 0 ? 'text-red-600' : 'text-green-600'
                            }`}>
                              ${Math.abs(txn.amount).toFixed(2)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {parsedData.length > 10 && (
                    <div className="bg-gray-50 px-3 py-2 text-xs text-gray-500 text-center">
                      Showing first 10 of {parsedData.length} transactions
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Buttons */}
            <div className="flex justify-end space-x-3">
              <button
                type="button"
                onClick={() => router.push('/transactions')}
                className="inline-flex justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleImport}
                disabled={!selectedCompany || parsedData.length === 0 || importing}
                className="inline-flex justify-center rounded-md border border-transparent bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
              >
                {importing ? 'Importing...' : `Import ${parsedData.length} Transactions`}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 bg-blue-50 border border-blue-200 rounded-md p-4">
        <h3 className="text-sm font-medium text-blue-900 mb-2">
          How to download your Amex CSV:
        </h3>
        <ol className="text-sm text-blue-800 space-y-1 list-decimal list-inside">
          <li>Log in to your American Express account</li>
          <li>Go to "Activity" or "Statements & Activity"</li>
          <li>Select the date range you want</li>
          <li>Click "Download" and choose CSV format</li>
          <li>Upload the file here</li>
        </ol>
      </div>
    </div>
  );
}