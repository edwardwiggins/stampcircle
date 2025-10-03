// app/providers.tsx
'use client';

import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { UserProvider } from './context/user-context';
import OfflineBanner from './components/OfflineBanner';
import { Toaster } from 'react-hot-toast';
import { Tooltip } from 'react-tooltip';
import 'react-tooltip/dist/react-tooltip.css';
import SupabaseListener from './components/SupabaseListener';

export function Providers({ children }: { children: React.ReactNode }) {
  // Create the query client instance
  const [queryClient] = useState(() => new QueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <UserProvider>
        <Toaster position="bottom-right" />
        <Tooltip id="app-tooltip" />
        <SupabaseListener />
        
        {children}
        
        <OfflineBanner />
      </UserProvider>
    </QueryClientProvider>
  );
}