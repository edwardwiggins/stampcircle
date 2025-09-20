// app/lib/client-supabase.ts
'use client';

import { createBrowserClient } from '@supabase/ssr';

// Create a single, shared Supabase client instance
const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Export the single instance as the default export
export default supabase;