// app/context/user-context.tsx
'use client';

import { createContext, useContext, useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { User, SupabaseClient } from '@supabase/supabase-js';
// --- UPDATED --- Added reconcileNotifications to the import
import { syncLocalPosts, syncLocalComments, syncLocalReactions, syncLocalDirectMessages, reconcileMessages, syncDeletedMessages, reconcileNotifications } from '@/app/lib/supabase-sync-utils';
import { db } from '@/app/lib/local-db';
import supabase from '@/app/lib/client-supabase';

const UserContext = createContext<{ 
 user: User | null; 
 loading: boolean; 
 userProfile: any | null;
 supabase: SupabaseClient;
 isOffline: boolean;
 isDbReady: boolean;
 newPostsAvailable: boolean;
 setNewPostsAvailable: (value: boolean) => void;
 hasNewMessages: boolean;
 setHasNewMessages: (value: boolean) => void;
 refreshUserProfile: (userToRefresh: User) => Promise<void>;
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
 const lastReconcile = useRef<number>(0);
 const [newPostsAvailable, setNewPostsAvailable] = useState(false);
 const [hasNewMessages, setHasNewMessages] = useState(false);

 const refreshUserProfile = useCallback(async (userToRefresh: User) => {
  if (!userToRefresh) return;
  try {
   const { data, error } = await supabase
    .from('user_profile')
    .select('*')
    .eq('user_id', userToRefresh.id)
    .single();
   
   if (error) throw error;
   
   setUserProfile(data);
   await db.userProfile.put(data);
  } catch (error) {
   console.error('Error refreshing user profile:', error);
  }
 }, []);

 const updateUserProfile = useCallback((profileData: any) => {
  setUserProfile(profileData);
 }, []);

 useEffect(() => {
  const fetchUser = async () => {
   const { data: { user } } = await supabase.auth.getUser(); 
   setUser(user);
   if (user) {
    await refreshUserProfile(user);
   }
   setLoading(false);
  };
  fetchUser();
  const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
   const sessionUser = session?.user ?? null;
   setUser(sessionUser);
   if (sessionUser) {
    refreshUserProfile(sessionUser);
   } else {
    setUserProfile(null);
   }
  });
  return () => {
   subscription.unsubscribe();
  };
 }, [refreshUserProfile]);

 useEffect(() => {
  const handleOnline = () => {
   console.log('Connection restored. Triggering background sync.');
   setIsOffline(false);
   syncLocalPosts(supabase);
   syncLocalComments(supabase);
   syncLocalReactions(supabase);
   syncLocalDirectMessages(supabase);
   syncDeletedMessages(supabase); 
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
 }, [supabase]);

 useEffect(() => {
  const smartReconcile = () => {
   if (document.visibilityState === 'visible' && userProfile?.user_id) {
    const now = Date.now();
    if (now - lastReconcile.current > 30000) { 
     reconcileMessages(supabase, userProfile.user_id);
          reconcileNotifications(supabase, userProfile.user_id); // --- UPDATED ---
     syncDeletedMessages(supabase); 
     lastReconcile.current = now;
    }
   }
  };

  if (userProfile?.user_id) {
   lastReconcile.current = Date.now();
   reconcileMessages(supabase, userProfile.user_id);
      reconcileNotifications(supabase, userProfile.user_id); // --- UPDATED ---
  }

  document.addEventListener('visibilitychange', smartReconcile);

  return () => {
   document.removeEventListener('visibilitychange', smartReconcile);
  };
 }, [userProfile?.user_id, supabase]);

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
  newPostsAvailable,
  setNewPostsAvailable,
  hasNewMessages,
  setHasNewMessages,
  refreshUserProfile,
  updateUserProfile
 }), [user, loading, userProfile, isOffline, isDbReady, newPostsAvailable, hasNewMessages, refreshUserProfile, updateUserProfile]);

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