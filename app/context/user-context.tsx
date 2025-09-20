'use client';

import { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { User, SupabaseClient } from '@supabase/supabase-js';
// --- UPDATED --- Import the new sync function
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
} | undefined>(undefined);

export function UserProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const [userProfile, setUserProfile] = useState<any | null>(null);
    const [isOffline, setIsOffline] = useState(
        typeof window !== 'undefined' ? !window.navigator.onLine : false
    );
    const [isDbReady, setIsDbReady] = useState(false);

    useEffect(() => {
        const fetchUser = async () => {
            const { data: { user } } = await supabase.auth.getUser(); 
            setUser(user);
            if (user) {
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
        const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
            fetchUser(); 
        });
        return () => {
            subscription.unsubscribe();
        };
    }, []);

    useEffect(() => {
        const handleOnline = () => {
            console.log('Connection restored. Triggering background sync.');
            setIsOffline(false);
            syncLocalPosts();
            syncLocalComments();
            // --- NEW --- Also sync reactions when connection is restored
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
        isDbReady
    }), [user, loading, userProfile, isOffline, isDbReady]);

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