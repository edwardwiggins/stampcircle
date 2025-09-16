'use client';

import { createContext, useContext, useState, useEffect } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { User, SupabaseClient } from '@supabase/supabase-js';
import { syncLocalPosts, syncLocalComments } from '@/app/lib/supabase-sync-utils';
// **NEW**: Import the local database instance.
import { db } from '@/app/lib/local-db';

// **UPDATED**: The context now also provides the 'isDbReady' state.
const UserContext = createContext<{ 
    user: User | null; 
    loading: boolean; 
    userProfile: any | null;
    supabase: SupabaseClient | null; 
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
    // **NEW**: State to track if the local Dexie DB is initialized.
    const [isDbReady, setIsDbReady] = useState(false);

    const [supabase] = useState(() => 
        createBrowserClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
        )
    );

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
    }, [supabase]);

    useEffect(() => {
        const handleOnline = () => {
            console.log('Connection restored. Triggering background sync.');
            setIsOffline(false);
            syncLocalPosts();
            syncLocalComments();
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

    // **NEW**: This useEffect handles the initialization of the local database.
    useEffect(() => {
        // The db.open() method returns a promise that resolves when the DB is ready.
        db.open().then(() => {
            console.log("Local DB is ready.");
            setIsDbReady(true);
        }).catch(err => {
            console.error("Failed to open local DB:", err);
            setIsDbReady(false); // You might want to show an error state
        });
    }, []); // Empty dependency array ensures this runs only once.

    return (
        // **UPDATED**: We pass the 'isDbReady' state down through the context.
        <UserContext.Provider value={{ user, loading, userProfile, supabase, isOffline, isDbReady }}>
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