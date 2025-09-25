// app/context/user-context.tsx
'use client';

import { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import { User, SupabaseClient } from '@supabase/supabase-js';
import { syncLocalPosts, syncLocalComments, syncLocalReactions } from '@/app/lib/supabase-sync-utils';
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
    // --- NEW --- Add a function to update the context's state directly
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

    // --- NEW --- Function to manually update the userProfile in the context
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
        const handleOnline = () => {
            console.log('Connection restored. Triggering background sync.');
            setIsOffline(false);
            syncLocalPosts();
            syncLocalComments();
            syncLocalReactions();
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
        updateUserProfile // --- NEW --- Provide the new function to the app
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