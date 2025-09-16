'use client';

import { createBrowserClient } from '@supabase/ssr';

// This function creates a new client instance for the browser.
// It's a function so that a new instance is created for each component,
// preventing issues with shared contexts.
export function createClientSupabaseClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}