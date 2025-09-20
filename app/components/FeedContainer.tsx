'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import Feed from './Feed';
import AddPostButton from './AddPostButton';
import { db } from '@/app/lib/local-db';
import type { LocalPost, LocalUserProfile, LocalComment, LocalCommentImage, LocalSavedPost, LocalNotification } from '@/app/lib/local-db';
import { useUser } from '@/app/context/user-context';
import { syncLocalPosts, syncLocalReactions } from '@/app/lib/supabase-sync-utils';
import { SlRefresh } from "react-icons/sl";
import { trackEvent } from '@/app/lib/analytics';
import { RealtimeChannel } from '@supabase/supabase-js';
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
    const { userProfile, loading: userLoading, supabase, isDbReady } = useUser();
    const [hasNewPosts, setHasNewPosts] = useState(false);
    const [newPostsAvailable, setNewPostsAvailable] = useState(false);
    const initialFetchComplete = useRef(false);
    const [isInitialLoading, setIsInitialLoading] = useState(true);

    const posts = useLiveQuery(
        () => db.social_posts
                .orderBy('created_at')
                .reverse()
                .filter(post => post.is_deleted !== true)
                .toArray(),
        [] 
    );

    const syncAllUsersForMentions = useCallback(async () => {
        if (!supabase || !navigator.onLine) return;
        try {
            const { data: allProfiles, error } = await supabase.from('user_profile').select('*');
            if (error) throw error;
            if (allProfiles) await db.userProfile.bulkPut(allProfiles);
        } catch (err) {
            console.error('Error pre-loading users for mentions:', err);
        }
    }, [supabase]);
    
    const syncReactionTypes = useCallback(async () => {
        if (!supabase || !navigator.onLine) return;
        try {
            const { data, error } = await supabase.from('social_reactions').select('*');
            if (error) throw error;
            if (data) await db.social_reactions.bulkPut(data);
        } catch (err) {
            console.error('Error syncing reaction types:', err);
        }
    }, [supabase]);

    const syncAndReconcileFeed = useCallback(async (isInitialLoad = false) => {
        if (!supabase || !userProfile) return;
        
        try {
            const { data: remotePosts, error: postsError } = await supabase.rpc('get_feed_for_user');
            if (postsError) throw postsError;
            
            const postIds = remotePosts.map(p => p.id);
            if (postIds.length === 0) { 
                if (isInitialLoad) setIsInitialLoading(false);
                return;
            }

            const { data: remotePostImages, error: postImagesError } = await supabase.from('social_post_images').select('*').in('post_id', postIds);
            if (postImagesError) throw postImagesError;

            const { data: remoteComments, error: commentsError } = await supabase.from('social_post_comments').select('*, social_comment_images(*)').in('post_id', postIds);
            if (commentsError) throw commentsError;
            
            const { data: remoteSavedPosts, error: savedPostsError } = await supabase.from('social_saved_posts').select('*').eq('user_id', userProfile.user_id);
            if (savedPostsError) throw savedPostsError;

            const { data: remoteNotifications, error: notificationsError } = await supabase.from('social_user_notifications').select('*').eq('receiving_user_id', userProfile.user_id);
            if (notificationsError) throw notificationsError;
            
            const { data: remotePostReactions, error: postReactionsError } = await supabase.from('social_posts_reactions').select('*').in('post_id', postIds);
            if (postReactionsError) throw postReactionsError;

            const commentIds = remoteComments.map(c => c.id);
            const { data: remoteCommentReactions, error: commentReactionsError } = await supabase.from('social_comments_reactions').select('*').in('comment_id', commentIds);
            if (commentReactionsError) throw commentReactionsError;

            const postAuthorIds = [...new Set(remotePosts.map(p => p.author_id).filter(Boolean))];
            const commentAuthorIds = [...new Set(remoteComments.map(c => c.author_id).filter(Boolean))];
            const notificationAuthorIds = [...new Set(remoteNotifications.map(n => n.last_sending_user_id).filter(Boolean))];
            const allAuthorIds = [...new Set([...postAuthorIds, ...commentAuthorIds, ...notificationAuthorIds])];

            const { data: profiles, error: profileError } = await supabase.from('user_profile').select('*').in('user_id', allAuthorIds);
            if (profileError) throw profileError;
            
            await db.transaction('rw', db.social_posts, db.social_post_images, db.social_post_comments, db.social_comment_images, db.userProfile, db.social_saved_posts, db.social_user_notifications, db.social_posts_reactions, db.social_comments_reactions, async () => {
                await db.social_posts.clear();
                await db.social_post_images.clear();
                await db.social_post_comments.clear();
                await db.social_comment_images.clear();
                await db.social_saved_posts.clear();
                await db.social_user_notifications.clear();
                await db.social_posts_reactions.clear();
                await db.social_comments_reactions.clear();

                if (remotePosts) await db.social_posts.bulkPut(remotePosts.map(p => ({ ...p, synced: 1 })));
                if (remotePostImages) await db.social_post_images.bulkPut(remotePostImages);
                if (profiles) await db.userProfile.bulkPut(profiles);
                if (remoteComments) {
                    const commentsToStore: LocalComment[] = [];
                    const imagesToStore: LocalCommentImage[] = [];
                    remoteComments.forEach(comment => {
                        const { social_comment_images, ...commentData } = comment;
                        commentsToStore.push({ ...commentData, created_at: new Date(commentData.created_at), synced: 1 });
                        if (social_comment_images) imagesToStore.push(...social_comment_images);
                    });
                    await db.social_post_comments.bulkPut(commentsToStore);
                    await db.social_comment_images.bulkPut(imagesToStore);
                }
                if (remoteSavedPosts) await db.social_saved_posts.bulkPut(remoteSavedPosts);
                if (remoteNotifications) {
                    const notificationsToStore = remoteNotifications.map(n => ({ ...n, is_read: n.is_read ? 1 : 0 }));
                    await db.social_user_notifications.bulkPut(notificationsToStore);
                }
                if (remotePostReactions) await db.social_posts_reactions.bulkPut(remotePostReactions);
                if (remoteCommentReactions) await db.social_comments_reactions.bulkPut(remoteCommentReactions);
            });
            
            setHasNewPosts(false);
            if (isInitialLoad) setIsInitialLoading(false);
        } catch (err) {
            console.error('Error during feed reconciliation:', err);
        }
    }, [supabase, userProfile]);

    useEffect(() => {
        if (!supabase || !userProfile) return;
        const postsChannel = supabase.channel('social-posts-changes').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'social_posts' }, (payload) => { if (payload.new.author_id !== userProfile.user_id) { setNewPostsAvailable(true); } }).subscribe();
        const notificationsChannel = supabase.channel('notifications-channel',{ config: { broadcast: { self: true } } }).on('broadcast', { event: 'new_notification' }, async ({ payload }) => { 
            const userNotifications = payload.new_notifications.filter((n: LocalNotification) => n.receiving_user_id === userProfile.user_id); 
            if (userNotifications.length > 0) { 
                // --- UPDATED --- Use the correct column name `last_sending_user_id`
                const senderIds = [...new Set(userNotifications.map((n: LocalNotification) => n.last_sending_user_id))]; 
                for (const senderId of senderIds) { 
                    const senderProfile = await db.userProfile.get(senderId); 
                    if (!senderProfile) { 
                        const { data } = await supabase.from('user_profile').select('*').eq('user_id', senderId).single(); 
                        if (data) await db.userProfile.put(data); 
                    } 
                } 
                const notificationsToStore = userNotifications.map((n: any) => ({ ...n, is_read: 0 })); 
                await db.social_user_notifications.bulkPut(notificationsToStore); 
            } 
        }).subscribe();
        return () => { supabase.removeChannel(postsChannel); supabase.removeChannel(notificationsChannel); };
    }, [supabase, userProfile]);
    
    useEffect(() => {
        let timer: NodeJS.Timeout | undefined;
        if (newPostsAvailable && !hasNewPosts) { timer = setTimeout(() => { setHasNewPosts(true); }, 300000); }
        return () => { if (timer) { clearTimeout(timer); } };
    }, [newPostsAvailable, hasNewPosts]);

    useEffect(() => {
        if (userProfile?.user_id && isDbReady && !initialFetchComplete.current) {
            initialFetchComplete.current = true;
            syncAllUsersForMentions();
            syncReactionTypes();
            syncLocalPosts();
            syncAndReconcileFeed(true);
        }
    }, [userProfile, isDbReady, syncAndReconcileFeed, syncAllUsersForMentions, syncReactionTypes]);
    
    const handleShowNewPosts = () => { syncAndReconcileFeed(false); setNewPostsAvailable(false); };
    const handleDeletePost = async (postId: number) => { if (!supabase) return; trackEvent('post_deleted', { post_id: postId }); await db.social_posts.update(postId, { is_deleted: true, synced: 0 }); syncLocalPosts(); toast.success('Post deleted successfully.'); };
    const handleUpdatePost = async (postId: number, newContent: string, newFiles: OutputFileEntry[], deletedImageIds: number[]) => { if (!supabase) return; trackEvent('post_updated', { postId, new_images_count: newFiles.length, deleted_images_count: deletedImageIds.length }); await db.social_posts.update(postId, { post_content: newContent, post_status: 'pending', synced: 0, newImages: newFiles, deletedImages: deletedImageIds }); syncLocalPosts(); toast.success('Post updated successfully.'); };
    const handleReportPost = async (postId: number) => { if (!supabase) return; trackEvent('post_reported', { post_id: postId }); await db.social_posts.update(postId, { post_status: 'reported' }); const { error } = await supabase.rpc('report_post', { post_id_to_report: postId }); toast.success('Post reported successfully.'); if (error) { console.error("Failed to report post:", error); await db.social_posts.update(postId, { post_status: 'approved' }); toast.error('Something went wrong. Please try again.'); } };
    const handleBlockUser = async (userIdToBlock: string) => { if (!supabase) return; trackEvent('user_blocked', { blocked_user_id: userIdToBlock }); const { error } = await supabase.rpc('block_user', { user_to_block_id: userIdToBlock }); if (error) { console.error('Failed to block user:', JSON.stringify(error, null, 2)); toast.error('Something went wrong. Please try again.'); } else { await syncAndReconcileFeed(false); toast.success('User blocked successfully.'); } };
    const handleSavePost = async (postId: number, isCurrentlySaved: boolean) => { if (!supabase || !userProfile) return; const eventName = isCurrentlySaved ? 'post_unsaved' : 'post_saved'; trackEvent(eventName, { post_id: postId }); const rpcName = isCurrentlySaved ? 'unsave_post' : 'save_post'; const params = { [`post_id_to_${isCurrentlySaved ? 'unsave' : 'save'}`]: postId }; if (isCurrentlySaved) { const recordToDelete = await db.social_saved_posts.where({ user_id: userProfile.user_id, post_id: postId }).first(); if (recordToDelete) await db.social_saved_posts.delete(recordToDelete.id); } else { await db.social_saved_posts.add({ id: -Date.now(), user_id: userProfile.user_id, post_id: postId, created_at: new Date().toISOString() }); } const { error } = await supabase.rpc(rpcName, params); if (error) { console.error(`Failed to ${eventName}:`, error); toast.error('Something went wrong. Please try again.'); syncAndReconcileFeed(false); } else { toast.success(isCurrentlySaved ? 'Post unsaved' : 'Post saved!'); } };

    if (userLoading || !isDbReady || isInitialLoading) {
        return <div className="feed-container">Loading feed...</div>;
    }

    return (
        <>
            {hasNewPosts && <NewPostsButton onClick={handleShowNewPosts} />}
            <AddPostButton />
            <Feed 
                posts={posts || []}
                userProfile={userProfile}
                onDeletePost={handleDeletePost}
                onUpdatePost={handleUpdatePost}
                onReportPost={handleReportPost}
                onBlockUser={handleBlockUser}
                onSavePost={handleSavePost}
            />
        </>
    );
}