'use client';

import { supabase } from '@/app/lib/supabase';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function SupabaseListener() {
  const router = useRouter();

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      // Refresh the page on successful sign-in
      if (event === 'SIGNED_IN') {
        router.refresh();
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [router]);

  return null;
}