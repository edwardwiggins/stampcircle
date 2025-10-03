// app/components/FeedContainer.tsx
'use client';

import { useEffect } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useInView } from 'react-intersection-observer';
import Feed from './Feed';
import AddPostButton from './AddPostButton';
import PostSkeleton from './PostSkeleton';
import { db } from '@/app/lib/local-db';
import { useUser } from '@/app/context/user-context';
import { syncLocalPosts, fetchStructuredFeed, syncUserSocialGraph } from '@/app/lib/supabase-sync-utils';
import FeedCarousel from './FeedCarousel';
import { SlRefresh } from "react-icons/sl";
import { trackEvent } from '@/app/lib/analytics';
import toast from 'react-hot-toast';
import type { OutputFileEntry } from '@uploadcare/react-uploader';

const NewPostsButton = ({ onClick }: { onClick: () => void }) => {
 return (
  <button onClick={onClick} className="new-posts-button">
   <SlRefresh className="mr-2" />
   Show New Posts
  </button>
 );
};

export default function FeedContainer() {
    const { userProfile, loading: userLoading, supabase, isDbReady, newPostsAvailable, setNewPostsAvailable } = useUser();

    const { 
        data, 
        fetchNextPage, 
        hasNextPage, 
        isFetchingNextPage, 
        isLoading: isFeedLoading, 
        refetch 
    } = useInfiniteQuery({
        queryKey: ['structured-feed', userProfile?.user_id],
        queryFn: ({ pageParam }) => fetchStructuredFeed(supabase, { pageParam }),
        initialPageParam: 0,
        getNextPageParam: (lastPage, allPages) => {
            return lastPage.hasMore ? allPages.length : undefined;
        },
        enabled: !!userProfile && isDbReady,
    });
    
    const { ref: infiniteScrollRef } = useInView({
        threshold: 0,
        rootMargin: "400px",
        onChange: (inView) => {
            if (inView && hasNextPage && !isFetchingNextPage) {
                fetchNextPage();
            }
        }
    });

    const handleHardRefresh = () => {
        setNewPostsAvailable(false);
        refetch();
    };

    useEffect(() => {
        // Initial sync logic (can be simplified if not needed elsewhere)
        if (userProfile?.user_id && isDbReady) {
            syncUserSocialGraph(supabase, userProfile.user_id);
            syncLocalPosts(supabase);
        }
    }, [userProfile, isDbReady, supabase]);

 // --- REMOVED --- All Realtime logic now lives in the global Header.tsx

 const handleDeletePost = async (postId: number) => { if (!supabase) return; trackEvent('post_deleted', { post_id: postId }); await db.social_posts.update(postId, { is_deleted: true, synced: 0 }); syncLocalPosts(supabase); toast.success('Post deleted successfully.'); };
 const handleUpdatePost = async (postId: number, newContent: string, newFiles: OutputFileEntry[], deletedImageIds: number[], allowComments: boolean) => { if (!supabase) return; trackEvent('post_updated', { postId, new_images_count: newFiles.length, deleted_images_count: deletedImageIds.length }); await db.social_posts.update(postId, { post_content: newContent, post_status: 'pending', synced: 0, newImages: newFiles, deletedImages: deletedImageIds, allow_comments: allowComments }); syncLocalPosts(supabase); toast.success('Post updated successfully.'); };
 const handleReportPost = async (postId: number) => { if (!supabase) return; trackEvent('post_reported', { post_id: postId }); await db.social_posts.update(postId, { post_status: 'reported' }); const { error } = await supabase.rpc('report_post', { post_id_to_report: postId }); toast.success('Post reported successfully.'); if (error) { console.error("Failed to report post:", error); await db.social_posts.update(postId, { post_status: 'approved' }); toast.error('Something went wrong. Please try again.'); } };
 const handleBlockUser = async (userIdToBlock: string) => { if (!supabase) return; trackEvent('user_blocked', { blocked_user_id: userIdToBlock }); const { error } = await supabase.rpc('block_user', { user_to_block_id: userIdToBlock }); if (error) { console.error('Failed to block user:', JSON.stringify(error, null, 2)); toast.error('Something went wrong. Please try again.'); } else { handleHardRefresh(); toast.success('User blocked successfully.'); } };
 const handleSavePost = async (postId: number, isCurrentlySaved: boolean) => { if (!supabase || !userProfile) return; const eventName = isCurrentlySaved ? 'post_unsaved' : 'post_saved'; trackEvent(eventName, { post_id: postId }); const rpcName = isCurrentlySaved ? 'unsave_post' : 'save_post'; const params = { [`post_id_to_${isCurrentlySaved ? 'unsave' : 'save'}`]: postId }; if (isCurrentlySaved) { const recordToDelete = await db.social_saved_posts.where({ user_id: userProfile.user_id, post_id: postId }).first(); if (recordToDelete) await db.social_saved_posts.delete(recordToDelete.id); } else { await db.social_saved_posts.add({ id: -Date.now(), user_id: userProfile.user_id, post_id: postId, created_at: new Date().toISOString() }); } const { error } = await supabase.rpc(rpcName, params); if (error) { console.error(`Failed to ${eventName}:`, error); toast.error('Something went wrong. Please try again.'); } else { toast.success(isCurrentlySaved ? 'Post unsaved' : 'Post saved!'); } };

 const renderFeedContent = () => {
        if (isFeedLoading) {
            return Array.from({ length: 5 }).map((_, index) => <PostSkeleton key={index} />);
        }
        if (!data) return <div className="text-center py-8 text-gray-500">Could not load feed.</div>;

        return (
            <div>
                {data.pages.map((page, pageIndex) => (
                    page.items.map((item: any, itemIndex: number) => {
                        const uniqueKey = `${pageIndex}-${item.type}-${item.data?.id || item.title}-${itemIndex}`;
                        if (item.type === 'carousel') {
                            return <FeedCarousel key={uniqueKey} title={item.title} items={item.items} />;
                        }
                        if (item.type === 'post') {
                            return (
                                <Feed 
                                    key={uniqueKey}
                                    posts={[item.data]}
                                    userProfile={userProfile}
                                    onDeletePost={handleDeletePost}
                                    onUpdatePost={handleUpdatePost}
                                    onReportPost={handleReportPost}
                                    onBlockUser={handleBlockUser}
                                    onSavePost={handleSavePost}
                                />
                            );
                        }
                        return null;
                    })
                ))}
                <div ref={infiniteScrollRef} style={{ height: '1px' }} />
                {isFetchingNextPage && <PostSkeleton />}
                {!hasNextPage && (
                    <div className="text-center py-8 text-gray-500">
                        You've reached the end of the feed.
                    </div>
                )}
            </div>
        );
    };

 if (userLoading || !isDbReady) {
        return (
            <div className="feed-container">
                {Array.from({ length: 5 }).map((_, index) => <PostSkeleton key={index} />)}
            </div>
        );
    }
 
    return (
        <>
            {newPostsAvailable && <NewPostsButton onClick={handleHardRefresh} />}
            <AddPostButton />
            {renderFeedContent()}
        </>
    );
}