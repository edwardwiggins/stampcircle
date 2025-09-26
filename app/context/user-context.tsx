// app/context/user-context.tsx
'use client';

import { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import { User, SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';
import { syncLocalPosts, syncLocalComments, syncLocalReactions, syncLocalDirectMessages, reconcileMessages } from '@/app/lib/supabase-sync-utils';
import { db } from '@/app/lib/local-db';
import supabase from '@/app/lib/client-supabase';

const UserContext = createContext<{ 
  user: User | null; 
  loading: boolean; 
  userProfile: any | null;
  supabase: SupabaseClient;
  isOffline: boolean;
  isDbReady: boolean;
  refreshUserProfile: () => Promise<void>;
  updateUserProfile: (profileData: any) => void;
} | undefined>(undefined);

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [userProfile, setUserProfile] = useState<any | null>(null);
  const [isOffline, setIsOffline] = useState(
    typeof window !== 'undefined' ? !window.navigator.onLine : false
  );
  const [isDbReady, setIsDbReady] = useState(false);

  const refreshUserProfile = useCallback(async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from('user_profile')
        .select('*')
        .eq('user_id', user.id)
        .single();
      
      if (error) throw error;
      
      setUserProfile(data);
      await db.userProfile.put(data);
    } catch (error) {
      console.error('Error refreshing user profile:', error);
    }
  }, [user]);

  const updateUserProfile = useCallback((profileData: any) => {
    setUserProfile(profileData);
  }, []);

  useEffect(() => {
    const fetchUser = async () => {
      const { data: { user } } = await supabase.auth.getUser(); 
      setUser(user);
      if (user) {
        await refreshUserProfile();
      }
      setLoading(false);
    };
    fetchUser();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        refreshUserProfile();
      } else {
        setUserProfile(null);
      }
    });
    return () => {
      subscription.unsubscribe();
    };
  }, [refreshUserProfile]);

    useEffect(() => {
        let channel: RealtimeChannel | undefined;

        if (user?.id) {
            channel = supabase.channel(`messages-for-${user.id}`, {
                config: { broadcast: { self: false } },
            });
            
            channel
                .on(
                    'postgres_changes',
                    {
                        event: 'INSERT',
                        schema: 'public',
                        table: 'social_user_direct_messages',
                        filter: `receiving_user_id=eq.${user.id}`,
                    },
                    (payload) => {
                        const newMessage = {
                            ...payload.new,
                            synced: 1,
                            is_read: 0,
                        };
                        db.social_user_direct_messages.put(newMessage);
                    }
                )
                .subscribe();
        }

        return () => {
            if (channel) {
                supabase.removeChannel(channel);
            }
        };
    }, [user?.id]);

  useEffect(() => {
    const handleOnline = () => {
      console.log('Connection restored. Triggering background sync.');
      setIsOffline(false);
      syncLocalPosts();
      syncLocalComments();
      syncLocalReactions();
            syncLocalDirectMessages();
    };
    const handleOffline = () => {
      console.log('Connection lost. Working offline.');
      setIsOffline(true);
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

    // --- UPDATED --- Replaced background polling with efficient "Sync on Focus"
    useEffect(() => {
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible' && userProfile?.user_id) {
                console.log('App brought to foreground. Reconciling messages...');
                reconcileMessages(userProfile.user_id);
            }
        };

        // Run once immediately when the user profile is first loaded
        if (userProfile?.user_id) {
            reconcileMessages(userProfile.user_id);
        }

        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [userProfile?.user_id]);

  useEffect(() => {
    db.open().then(() => {
      console.log("Local DB is ready.");
      setIsDbReady(true);
    }).catch(err => {
      console.error("Failed to open local DB:", err);
      setIsDbReady(false);
    });
  }, []);

  const value = useMemo(() => ({
    user,
    loading,
    userProfile,
    supabase,
    isOffline,
    isDbReady,
    refreshUserProfile,
    updateUserProfile
  }), [user, loading, userProfile, isOffline, isDbReady, refreshUserProfile, updateUserProfile]);

  return (
    <UserContext.Provider value={value}>
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