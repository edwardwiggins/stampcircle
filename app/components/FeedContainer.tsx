// app/components/FeedContainer.tsx
'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import Feed from './Feed';
import AddPostButton from './AddPostButton';
import PostSkeleton from './PostSkeleton';
import { db } from '@/app/lib/local-db';
import type { LocalPost, LocalUserProfile, LocalNotification } from '@/app/lib/local-db';
import { useUser } from '@/app/context/user-context';
import { syncLocalPosts, fetchPaginatedFeed, syncUserSocialGraph } from '@/app/lib/supabase-sync-utils';
import { SlRefresh } from "react-icons/sl";
import { trackEvent } from '@/app/lib/analytics';
import { useInView } from 'react-intersection-observer';
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
 const initialFetchComplete = useRef(false);
 
 const [isInitialLoading, setIsInitialLoading] = useState(true);
 const [isPageLoading, setIsPageLoading] = useState(false);
 const [currentPage, setCurrentPage] = useState(0);
 const [hasMore, setHasMore] = useState(true);

 const posts = useLiveQuery(
  () => db.social_posts
   .orderBy('created_at')
   .reverse()
   .filter(post => post.is_deleted !== true)
   .toArray(),
  [] 
 );

 const { ref: infiniteScrollRef, inView: isInfiniteScrollTriggerVisible } = useInView({
  threshold: 0,
  rootMargin: "400px",
 });

 const loadMorePosts = useCallback(async () => {
  if (isPageLoading || !hasMore || !userProfile) return;

  setIsPageLoading(true);
  const nextPage = currentPage + 1;
  const result = await fetchPaginatedFeed(supabase, userProfile.user_id, nextPage);
  
  setHasMore(result.hasMore);
  setCurrentPage(nextPage);
  setIsPageLoading(false);
 }, [isPageLoading, hasMore, currentPage, userProfile, supabase]);

 useEffect(() => {
  if (isInfiniteScrollTriggerVisible && !isInitialLoading) {
   loadMorePosts();
  }
 }, [isInfiniteScrollTriggerVisible, isInitialLoading, loadMorePosts]);

 const syncInitialData = useCallback(async () => {
  if (!supabase || !navigator.onLine) return;
  try {
   const [reactionTypes, allUsers] = await Promise.all([
    supabase.from('social_reactions').select('*'),
    supabase.from('user_profile').select('*')
   ]);
   
   if (reactionTypes.data) await db.social_reactions.bulkPut(reactionTypes.data);
   if (allUsers.data) await db.userProfile.bulkPut(allUsers.data);

  } catch (err) {
   console.error('Error pre-loading initial data:', err);
  }
 }, [supabase]);

 const handleHardRefresh = useCallback(async () => {
  if (!userProfile || !supabase) return;
  
  setIsInitialLoading(true);
  setNewPostsAvailable(false);
  setCurrentPage(0);
  setHasMore(true);

  await db.social_posts.clear();
  await db.social_post_images.clear();
  
  await syncUserSocialGraph(supabase, userProfile.user_id);
  const result = await fetchPaginatedFeed(supabase, userProfile.user_id, 0);
  setHasMore(result.hasMore);
  setIsInitialLoading(false);

 }, [userProfile, supabase, setNewPostsAvailable]);

 useEffect(() => {
  if (userProfile?.user_id && isDbReady && !initialFetchComplete.current) {
   initialFetchComplete.current = true;
   
   const performInitialLoad = async () => {
    setIsInitialLoading(true);
    await syncInitialData();
    await syncUserSocialGraph(supabase, userProfile.user_id);
    const result = await fetchPaginatedFeed(supabase, userProfile.user_id, 0);
    
    setHasMore(result.hasMore);
    setIsInitialLoading(false);
    syncLocalPosts(supabase);
   };
   
   performInitialLoad();
  }
 }, [userProfile, isDbReady, syncInitialData, supabase]);

 // --- REMOVED --- All Realtime logic now lives in the global Header.tsx

 const handleDeletePost = async (postId: number) => { if (!supabase) return; trackEvent('post_deleted', { post_id: postId }); await db.social_posts.update(postId, { is_deleted: true, synced: 0 }); syncLocalPosts(supabase); toast.success('Post deleted successfully.'); };
 const handleUpdatePost = async (postId: number, newContent: string, newFiles: OutputFileEntry[], deletedImageIds: number[], allowComments: boolean) => { if (!supabase) return; trackEvent('post_updated', { postId, new_images_count: newFiles.length, deleted_images_count: deletedImageIds.length }); await db.social_posts.update(postId, { post_content: newContent, post_status: 'pending', synced: 0, newImages: newFiles, deletedImages: deletedImageIds, allow_comments: allowComments }); syncLocalPosts(supabase); toast.success('Post updated successfully.'); };
 const handleReportPost = async (postId: number) => { if (!supabase) return; trackEvent('post_reported', { post_id: postId }); await db.social_posts.update(postId, { post_status: 'reported' }); const { error } = await supabase.rpc('report_post', { post_id_to_report: postId }); toast.success('Post reported successfully.'); if (error) { console.error("Failed to report post:", error); await db.social_posts.update(postId, { post_status: 'approved' }); toast.error('Something went wrong. Please try again.'); } };
 const handleBlockUser = async (userIdToBlock: string) => { if (!supabase) return; trackEvent('user_blocked', { blocked_user_id: userIdToBlock }); const { error } = await supabase.rpc('block_user', { user_to_block_id: userIdToBlock }); if (error) { console.error('Failed to block user:', JSON.stringify(error, null, 2)); toast.error('Something went wrong. Please try again.'); } else { handleHardRefresh(); toast.success('User blocked successfully.'); } };
 const handleSavePost = async (postId: number, isCurrentlySaved: boolean) => { if (!supabase || !userProfile) return; const eventName = isCurrentlySaved ? 'post_unsaved' : 'post_saved'; trackEvent(eventName, { post_id: postId }); const rpcName = isCurrentlySaved ? 'unsave_post' : 'save_post'; const params = { [`post_id_to_${isCurrentlySaved ? 'unsave' : 'save'}`]: postId }; if (isCurrentlySaved) { const recordToDelete = await db.social_saved_posts.where({ user_id: userProfile.user_id, post_id: postId }).first(); if (recordToDelete) await db.social_saved_posts.delete(recordToDelete.id); } else { await db.social_saved_posts.add({ id: -Date.now(), user_id: userProfile.user_id, post_id: postId, created_at: new Date().toISOString() }); } const { error } = await supabase.rpc(rpcName, params); if (error) { console.error(`Failed to ${eventName}:`, error); toast.error('Something went wrong. Please try again.'); } else { toast.success(isCurrentlySaved ? 'Post unsaved' : 'Post saved!'); } };

 const renderFeedContent = () => {
  if (isInitialLoading) {
   return Array.from({ length: 5 }).map((_, index) => <PostSkeleton key={index} />);
  }
  
  return (
   <>
    <Feed 
     posts={posts || []}
     userProfile={userProfile}
     onDeletePost={handleDeletePost}
     onUpdatePost={handleUpdatePost}
     onReportPost={handleReportPost}
     onBlockUser={handleBlockUser}
     onSavePost={handleSavePost}
    />
    <div ref={infiniteScrollRef} style={{ height: '1px' }} />

    {isPageLoading && <PostSkeleton />}

    {!isPageLoading && !hasMore && posts && posts.length > 0 && (
     <div className="text-center py-8 text-gray-500">
      You&apos;ve reached the end of the feed.
     </div>
    )}
   </>
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