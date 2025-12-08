// lib/supabase.ts - Supabase client setup

import { createClient } from '@supabase/supabase-js';

// Browser client
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// For server-side operations (API routes)
export function getSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

// Helper function to get signed URL for receipt
export async function getReceiptUrl(filePath: string): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from('receipts')
    .createSignedUrl(filePath, 3600); // 1 hour expiry

  if (error) {
    console.error('Error getting signed URL:', error);
    return null;
  }

  return data.signedUrl;
}

// Helper function to upload receipt
export async function uploadReceipt(
  file: File,
  companyId: string
): Promise<{ path: string; url: string } | null> {
  const fileName = `${companyId}/${Date.now()}-${file.name}`;

  const { data, error } = await supabase.storage
    .from('receipts')
    .upload(fileName, file, {
      cacheControl: '3600',
      upsert: false,
    });

  if (error) {
    console.error('Error uploading receipt:', error);
    return null;
  }

  const url = await getReceiptUrl(data.path);
  if (!url) return null;

  return {
    path: data.path,
    url,
  };
}
