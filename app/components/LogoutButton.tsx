'use client';

import { useRouter } from 'next/navigation';
import { useUser } from '@/app/context/user-context';
import { db } from '@/app/lib/local-db';
import { SlLogout } from 'react-icons/sl';

export default function LogoutButton() {
    const { supabase } = useUser();
    const router = useRouter();

    const handleLogout = async () => {
        if (!supabase) return;

        // 1. Sign the user out from Supabase
        const { error } = await supabase.auth.signOut();

        if (error) {
            console.error('Error signing out:', error);
            // Optionally, show an error message to the user
            return;
        }

        // 2. Clear user-specific tables in the local Dexie database
        try {
            await db.social_posts.clear();
            await db.social_post_comments.clear();
            await db.userProfile.clear();
            // Add any other user-specific tables here
            console.log('Local database cleared.');
        } catch (dbError) {
            console.error('Error clearing local database:', dbError);
        }

        // 3. Redirect to the login page
        router.push('/login');
    };

    return (
        <button onClick={handleLogout} className="logout-button-dropdown">
            <SlLogout className="mr-[8px]" />
            Logout
        </button>
    );
}