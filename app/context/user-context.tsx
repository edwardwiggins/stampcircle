// app/context/user-context.tsx
'use client';

import { createContext, useContext, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/app/lib/supabase-client';
import { User } from '@supabase/supabase-js';

const UserContext = createContext<{ user: User | null; loading: boolean; userProfile: any | null } | undefined>(undefined);

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [userProfile, setUserProfile] = useState<any | null>(null);
  const router = useRouter();

  useEffect(() => {
    const fetchUser = async () => {
      // Use getUser() for secure authentication
      const { data: { user } } = await supabase.auth.getUser(); 
      setUser(user);
      
      if (user) {
        // Fetch user profile from the database
        const { data, error } = await supabase
          .from('user_profile')
          .select('*')
          .eq('user_id', user.id)
          .single();

        if (error) {
          console.error('Error fetching user profile:', error.message);
        } else {
          setUserProfile(data);
        }
      }
      setLoading(false);
    };

    fetchUser();
    
    // Listen for auth state changes and re-run fetchUser for up-to-date info
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      // Re-fetch user on any auth state change
      fetchUser(); 
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  return (
    <UserContext.Provider value={{ user, loading, userProfile }}>
      {children}
    </UserContext.Provider>
  );
}

export const useUser = () => {
  const context = useContext(UserContext);
  if (context === undefined) {
    throw new Error('useUser must be used within a UserProvider');
  }
  return context;
};