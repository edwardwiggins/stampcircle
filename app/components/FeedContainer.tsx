'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import Feed from './Feed';
import AddPostButton from './AddPostButton';
import { db } from '@/app/lib/local-db';
import type { LocalPost, LocalUserProfile, LocalComment, LocalCommentImage } from '@/app/lib/local-db';
import { useUser } from '@/app/context/user-context';
import { syncLocalPosts } from '@/app/lib/supabase-sync-utils';
import { SlRefresh } from "react-icons/sl";
import { trackEvent } from '@/app/lib/analytics';
import { RealtimeChannel } from '@supabase/supabase-js';

const NewPostsButton = ({ onClick }: { onClick: () => void }) => {
    return (
        <button onClick={onClick} className="new-posts-button">
            <SlRefresh className="mr-2" />
            Show New Posts
        </button>
    );
};

export default function FeedContainer() {
    const { userProfile, loading: userLoading, supabase, isDbReady } = useUser();
    const [hasNewPosts, setHasNewPosts] = useState(false);
    const initialFetchComplete = useRef(false);
    const [isInitialLoading, setIsInitialLoading] = useState(true);
    const channelRef = useRef<RealtimeChannel | null>(null);

    const posts = useLiveQuery(
        () => db.social_posts
                .orderBy('created_at')
                .reverse()
                .filter(post => post.is_deleted !== true)
                .toArray(),
        [] 
    );

    const syncAndReconcileFeed = useCallback(async (isInitialLoad = false) => {
        if (!supabase || !navigator.onLine) return;
        
        try {
            const { data: remotePosts, error: postsError } = await supabase.rpc('get_feed_for_user');
            if (postsError) throw postsError;

            await db.social_posts.clear();
            await db.social_post_comments.clear();
            await db.social_comment_images.clear();
            await db.userProfile.clear();

            if (remotePosts && remotePosts.length > 0) {
                const postsToStore: LocalPost[] = remotePosts.map(p => ({ ...p, synced: 1 }));
                await db.social_posts.bulkPut(postsToStore);
                
                const postAuthorIds = [...new Set(remotePosts.map(p => p.author_id))];
                const postIds = remotePosts.map(p => p.id);
                
                const { data: remoteComments, error: commentsError } = await supabase.from('social_post_comments').select('*, social_comment_images(*)').in('post_id', postIds);
                if (commentsError) throw commentsError;
                
                if (remoteComments) {
                    const commentAuthorIds = [...new Set(remoteComments.map(c => c.author_id))];
                    const allAuthorIds = [...new Set([...postAuthorIds, ...commentAuthorIds])];

                    if (allAuthorIds.length > 0) {
                        const { data: profiles, error: profileError } = await supabase.from('user_profile').select('*').in('user_id', allAuthorIds);
                        if (profileError) throw profileError;
                        if (profiles) await db.userProfile.bulkPut(profiles);
                    }

                    const commentsToStore: LocalComment[] = [];
                    const imagesToStore: LocalCommentImage[] = [];
                    remoteComments.forEach(comment => {
                        const { social_comment_images, ...commentData } = comment;
                        commentsToStore.push({ ...commentData, created_at: new Date(commentData.created_at), synced: 1 });
                        if (social_comment_images) { imagesToStore.push(...social_comment_images); }
                    });
                    
                    await db.social_post_comments.bulkPut(commentsToStore);
                    await db.social_comment_images.bulkPut(imagesToStore);
                }
            }
            
            setHasNewPosts(false);
            if (isInitialLoad) {
                setIsInitialLoading(false);
            }
        } catch (err) {
            console.error('Error during feed reconciliation:', err);
        }
    }, [supabase]);

    useEffect(() => {
        if (!supabase) return;

        if (!channelRef.current) {
            channelRef.current = supabase.channel('public:realtime_posts')
                .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'realtime_posts' }, 
                (payload) => {
                    if (payload.new.author_id !== userProfile?.user_id) {
                        setHasNewPosts(true);
                    }
                })
                .subscribe();
        }

        return () => {
            if (channelRef.current) {
                supabase.removeChannel(channelRef.current);
                channelRef.current = null;
            }
        };
    }, [supabase, userProfile?.user_id]);

    useEffect(() => {
        if (userProfile?.user_id && isDbReady && !initialFetchComplete.current) {
            initialFetchComplete.current = true;
            syncLocalPosts();
            syncAndReconcileFeed(true);
        }
    }, [userProfile, isDbReady, syncAndReconcileFeed]);

    const handleShowNewPosts = () => {
        syncAndReconcileFeed(false);
    };

    const handleDeletePost = async (postId: number) => {
        if (!supabase) return;
        trackEvent('post_deleted', { post_id: postId });
        await db.social_posts.update(postId, { is_deleted: true, synced: 0 });
        syncLocalPosts();
    };

    const handleUpdatePost = async (postId: number, newContent: string) => {
        if (!supabase) return;
        trackEvent('post_updated', { post_id: postId });
        await db.social_posts.update(postId, { post_content: newContent, post_status: 'pending', synced: 0 });
        syncLocalPosts();
    };

    const handleReportPost = async (postId: number) => {
        if (!supabase) return;
        trackEvent('post_reported', { post_id: postId });
        await db.social_posts.update(postId, { post_status: 'reported' });
        const { error } = await supabase.rpc('report_post', { post_id_to_report: postId });
        if (error) {
            console.error("Failed to report post:", error);
            await db.social_posts.update(postId, { post_status: 'approved' });
        }
    };

    const handleBlockUser = async (userIdToBlock: string) => {
        if (!supabase) return;
        trackEvent('user_blocked', { blocked_user_id: userIdToBlock });
        
        const { error } = await supabase.rpc('block_user', { user_to_block_id: userIdToBlock });

        if (error) {
            // **THE FIX**: Use JSON.stringify to see the full error object.
            console.error('Failed to block user:', JSON.stringify(error, null, 2));
        } else {
            console.log(`User ${userIdToBlock} blocked. Refreshing feed.`);
            await syncAndReconcileFeed(false);
        }
    };

    if (userLoading || !isDbReady || isInitialLoading) {
        return <div className="feed-container">Loading feed...</div>;
    }

    return (
        <>
            {hasNewPosts && (
                <NewPostsButton onClick={handleShowNewPosts} />
            )}
            
            <AddPostButton />
            <Feed 
                posts={posts || []}
                userProfile={userProfile}
                onDeletePost={handleDeletePost}
                onUpdatePost={handleUpdatePost}
                onReportPost={handleReportPost}
                onBlockUser={handleBlockUser}
            />
        </>
    );
}