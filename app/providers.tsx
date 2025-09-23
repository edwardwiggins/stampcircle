// app/providers.tsx

'use client';

import { UserProvider } from './context/user-context';
import OfflineBanner from './components/OfflineBanner';
import { Toaster } from 'react-hot-toast';
import { Tooltip } from 'react-tooltip';
import 'react-tooltip/dist/react-tooltip.css';
import SupabaseListener from './components/SupabaseListener';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <UserProvider>
      {/* All client-side global components now live here */}
      <Toaster position="bottom-right" />
      <Tooltip id="app-tooltip" />
      <SupabaseListener />
      
      {children}
      
      <OfflineBanner />
    </UserProvider>
  );
}