'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import Feed from './Feed';
import AddPostButton from './AddPostButton';
import { db } from '@/app/lib/local-db';
import type { LocalPost, LocalUserProfile } from '@/app/lib/local-db';
import { useUser } from '@/app/context/user-context';
import { syncLocalPosts } from '@/app/lib/supabase-sync-utils';
import { SlRefresh } from "react-icons/sl";

// Helper Component for the floating button (unchanged)
const NewPostsButton = ({ count, onClick }: { count: number; onClick: () => void }) => {
    return (
        <button onClick={onClick} className="new-posts-button">
            <SlRefresh className="mr-2" />
            Show {count} New {count > 1 ? 'Posts' : 'Post'}
        </button>
    );
};

// Custom hook for intervals (unchanged)
function useInterval(callback: () => void, delay: number | null) {
    const savedCallback = useRef<() => void>();
    useEffect(() => { savedCallback.current = callback; }, [callback]);
    useEffect(() => {
        function tick() { if (savedCallback.current) savedCallback.current(); }
        if (delay !== null) {
            const id = setInterval(tick, delay);
            return () => clearInterval(id);
        }
    }, [delay]);
}

// --- The Main FeedContainer Component ---
export default function FeedContainer() {
    // **UPDATED**: Destructure the new 'isDbReady' state from the context.
    const { userProfile, loading: userLoading, supabase, isDbReady } = useUser();
    const [newPostCount, setNewPostCount] = useState(0);

    const posts = useLiveQuery(
        () => db.social_posts.orderBy('created_at').reverse().toArray(),
        [] 
    );

    const prevPostCount = useRef(posts?.length || 0);

    const syncAndReconcileFeed = useCallback(async () => {
        if (!supabase || !navigator.onLine) return;
        
        console.log('Running full feed reconciliation...');
        try {
            const { data: remotePosts, error } = await supabase.rpc('get_feed_for_user');
            if (error) throw error;

            if (remotePosts) {
                const postsToStore: LocalPost[] = remotePosts.map(p => ({ ...p, synced: 1 }));
                await db.social_posts.bulkPut(postsToStore);

                const authorIds = [...new Set(remotePosts.map(p => p.author_id))];
                if (authorIds.length > 0) {
                    const { data: profiles, error: profileError } = await supabase.from('user_profile').select('*').in('user_id', authorIds);
                    if (profileError) throw profileError;
                    if (profiles) await db.userProfile.bulkPut(profiles);
                }
            }
            
            setNewPostCount(0);
            console.log('Feed reconciliation complete.');
        } catch (err) {
            console.error('Error during feed reconciliation:', err);
        }
    }, [supabase]);

    const pollForNewPosts = useCallback(async () => {
        if (!navigator.onLine || document.hidden || !supabase || !posts || posts.length === 0) return;
        
        const latestKnownTimestamp = posts[0].created_at;
        const { data, error } = await supabase.rpc('check_for_new_posts', { latest_known_timestamp: latestKnownTimestamp });
        
        if (error) console.error("Failed to check for new posts:", JSON.stringify(error, null, 2));
        else if (data > 0) setNewPostCount(data);
    }, [posts, supabase]);

    useInterval(pollForNewPosts, 30000);

    useEffect(() => {
        const currentPostCount = posts?.length || 0;
        if (currentPostCount > prevPostCount.current) {
            pollForNewPosts();
        }
        prevPostCount.current = currentPostCount;
    }, [posts, pollForNewPosts]);

    useEffect(() => {
        if (userProfile?.user_id) {
            syncLocalPosts();
            syncAndReconcileFeed();
        }
    }, [userProfile, syncAndReconcileFeed]);

    const handleShowNewPosts = () => {
        syncAndReconcileFeed();
    };

    const handleDeletePost = async (postId: number) => {
        if (!supabase) return;
        await db.social_posts.update(postId, { is_deleted: true, synced: 0 });
        syncLocalPosts();
    };

    const handleUpdatePost = async (postId: number, newContent: string) => {
        if (!supabase) return;
        await db.social_posts.update(postId, { post_content: newContent, post_status: 'pending', synced: 0 });
        syncLocalPosts();
    };

    const handleReportPost = async (postId: number) => {
        if (!supabase) return;
        await db.social_posts.update(postId, { post_status: 'reported' });
        const { error } = await supabase.rpc('report_post', { post_id_to_report: postId });
        if (error) {
            console.error("Failed to report post:", error);
            await db.social_posts.update(postId, { post_status: 'approved' });
        }
    };

    // **UPDATED**: The component now waits for the user profile AND the database to be ready.
    if (userLoading || !isDbReady || !posts) {
        return <div className="feed-container">Loading feed...</div>;
    }

    return (
        <>
            {newPostCount > 0 && (
                <NewPostsButton count={newPostCount} onClick={handleShowNewPosts} />
            )}
            
            <AddPostButton />
            <Feed 
                posts={posts} 
                userProfile={userProfile}
                onDeletePost={handleDeletePost}
                onUpdatePost={handleUpdatePost}
                onReportPost={handleReportPost}
            />
        </>
    );
}