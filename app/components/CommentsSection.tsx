// app/components/CommentsSection.tsx
'use client';

import Image from 'next/image';
import { useState, useEffect } from 'react';
import { formatRelativeTime, pluralize } from '@/app/lib/utils';
import { db, LocalComment, LocalUserProfile } from '@/app/lib/local-db';
import { useLiveQuery } from 'dexie-react-hooks';
import { useUser } from '@/app/context/user-context';
import '@/app/styles/comments.css';
import AddCommentInput from './AddCommentInput';
import { supabase } from '@/app/lib/supabase-client';
import { RealtimeChannel } from '@supabase/supabase-js';

// Standalone Comment component for recursive rendering
const Comment = ({ comment, onReply, allComments, activeReplyParentId, userAvatarUrl, userProfile, onAddComment }: {
    comment: LocalComment,
    onReply: (parentId: number) => void,
    allComments: LocalComment[],
    activeReplyParentId: number | null,
    userAvatarUrl: string,
    userProfile: LocalUserProfile | null,
    onAddComment: (commentContent: string, parentId: number | null) => void
}) => {
    const defaultAvatar = '/default-avatar.jpg';
    const [isRepliesExpanded, setIsRepliesExpanded] = useState(false);

    // Fetch author profile for this specific comment
    const authorProfile: LocalUserProfile | undefined = useLiveQuery(
        () => db.userProfile.where('user_id').equals(comment.author_id).first(),
        [comment.author_id]
    );

    // Fetch replies for this specific comment
    const replies: LocalComment[] | undefined = useLiveQuery(
        () => db.social_post_comments.where('parent_comment_id').equals(comment.id).sortBy('created_at'),
        [comment.id]
    );

    if (!authorProfile) {
        return <div className="comment-block" style={{ marginLeft: `${comment.depth * 40}px` }}>Loading comment...</div>;
    }

    const authorAvatar = authorProfile?.profileImage || defaultAvatar;

    // Check for replies using the full comments array to be more robust
    const hasReplies = allComments.some(c => c.parent_comment_id === comment.id);

    return (
        <div key={comment.id}>
            <div className="comment-thread" style={{ marginLeft: `${comment.depth * 40}px` }}>
                <div className="comment-heading">
                    <Image
                        className='comment-avatar'
                        src={authorAvatar}
                        alt="Avatar"
                        width={40}
                        height={40}
                    />
                    <div className='user-info'>
                        <span className="comment-username">{authorProfile?.displayName || 'Unknown User'}</span>
                        
                        <span className='comment-date'>{formatRelativeTime(comment.created_at)}</span>
                    </div>
                </div>
                <div className="comment-content">
                    {/* Display a status badge if the comment is not yet approved and belongs to the current user */}
                        {comment.author_id === userProfile?.user_id && (comment.status === 'pending' || comment.status === 'flagged') && (
                            <span className={`status-badge ${comment.status}`}>
                                {comment.status === 'pending' && 'Pending Moderation'}
                                {comment.status === 'flagged' && (
                                    <>
                                        Moderation Failed
                                        <a href="#" className="appeal-link" onClick={(e) => { e.preventDefault(); /* Appeal logic here */ }}>
                                            (Appeal)
                                        </a>
                                    </>
                                )}
                            </span>
                        )}
                    <p>{comment.comment_content}</p>
                </div>
                <div className="comment-info">
                    <div className="comment-response">Like</div>
                    <div className="comment-response" onClick={() => onReply(comment.id)}>Reply</div>
                        
                </div>
                {hasReplies && (
                            <div className="more-replies" onClick={() => setIsRepliesExpanded(!isRepliesExpanded)} >
                                {isRepliesExpanded ? `Hide ${pluralize(replies?.length || 0, 'reply', 'replies')}` : `View ${pluralize(replies?.length || 0, 'reply', 'replies')}`}
                            </div>
                        )}
            </div>
            {activeReplyParentId === comment.id && (
                <div className="reply-form-container mt-2" style={{ marginLeft: `${comment.depth * 40 + 40}px` }}>
                    {/* Pass the onAddComment prop to AddCommentInput */}
                    <AddCommentInput userProfile={userProfile} onAddComment={onAddComment} parentId={comment.id} />
                </div>
            )}
            {isRepliesExpanded && replies && replies.length > 0 && (
                <div>
                    {replies.map(reply => (
                        <Comment
                            key={reply.id}
                            comment={reply}
                            onReply={onReply}
                            allComments={allComments}
                            activeReplyParentId={activeReplyParentId}
                            userAvatarUrl={userAvatarUrl}
                            userProfile={userProfile}
                            onAddComment={onAddComment}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};

//---

export default function CommentsSection({ postId }: { postId: number }) {
    const { userProfile, loading: userLoading } = useUser();
    const [activeReplyParentId, setActiveReplyParentId] = useState<number | null>(null);
    const [visibleComments, setVisibleComments] = useState(3);

    // Conditionals to control the query
    const showAllComments = userProfile && userProfile.user_id;

    // Live query for all comments related to this post
    const allComments: LocalComment[] | undefined = useLiveQuery(
        () => {
            if (!showAllComments) {
                // Return an empty array or a filtered query if the user is not logged in or loading
                return db.social_post_comments
                    .where('post_id').equals(postId)
                    .and(c => c.status === 'approved')
                    .toArray();
            }

            // The full query runs only when we have the userProfile
            return db.social_post_comments
                .where('post_id').equals(postId)
                .and(c => c.status === 'approved' || c.author_id === userProfile.user_id)
                .toArray();
        },
        [postId, userProfile?.user_id]
    );

    const commentUserProfiles: LocalUserProfile[] | undefined = useLiveQuery(
        () => db.userProfile.toArray(),
        []
    );

    // --- Core Offline-First Logic ---
    const syncComments = async () => {
        const unsyncedComments = await db.social_post_comments
            .where('synced')
            .equals(0)
            .toArray();

        if (unsyncedComments.length === 0) {
            return;
        }

        console.log(`Syncing ${unsyncedComments.length} unsynced comments...`);

        for (const comment of unsyncedComments) {
            try {
                // Insert the comment into Supabase. We omit the 'id' and 'path' fields.
                const { data, error } = await supabase
                    .from('social_post_comments')
                    .insert({
                        post_id: comment.post_id,
                        author_id: comment.author_id,
                        comment_content: comment.comment_content,
                        parent_comment_id: comment.parent_comment_id,
                        depth: comment.depth, // Explicitly pass the depth value
                    })
                    .select();

                if (error) {
                    console.error("Error inserting into Supabase:", error);
                    continue;
                }

                const newComment = data[0];

                // Update the local record with the real ID and mark as synced.
                // We'll update the status after receiving the real-time notification from Supabase.
                await db.social_post_comments.update(comment.id!, {
                    id: newComment.id,
                    created_at: newComment.created_at,
                    path: newComment.path, // Use the path generated by the database
                    synced: 1, // Mark as synced
                });

            } catch (err) {
                console.error("An unexpected sync error occurred:", err);
            }
        }
    };

    // A new function to fetch and reconcile remote changes
    const reconcileRemoteComments = async () => {
        try {
            // Fetch the latest comments for this post from Supabase
            const { data, error } = await supabase
                .from('social_post_comments')
                .select('*')
                .eq('post_id', postId);

            if (error) {
                console.error('Error fetching remote comments:', error);
                return;
            }

            // Create a set of remote comment IDs for efficient lookup
            const remoteIds = new Set(data.map(c => c.id));

            // Get all local comments for this post
            const localComments = await db.social_post_comments.where('post_id').equals(postId).toArray();

            // 1. Delete local comments that don't exist on the server (and are not unsynced)
            const commentsToDelete = localComments.filter(c => !remoteIds.has(c.id) && c.synced === 1);
            await db.social_post_comments.bulkDelete(commentsToDelete.map(c => c.id));

            // 2. Add or update local comments with the latest data from the server
            await db.social_post_comments.bulkPut(data.map(comment => ({
                id: comment.id,
                post_id: comment.post_id,
                author_id: comment.author_id,
                comment_content: comment.comment_content,
                parent_comment_id: comment.parent_comment_id,
                depth: comment.depth,
                path: comment.path,
                synced: 1, // Mark as synced since it came from the server
                status: comment.status,
                created_at: new Date(comment.created_at)
            })));

            console.log('Reconciliation complete. Local DB is now in sync with Supabase.');

        } catch (err) {
            console.error('An error occurred during reconciliation:', err);
        }
    };

    // New useEffect to handle real-time subscription for replies only
    useEffect(() => {
        if (!userProfile) return;

        // Get the IDs of all comments the current user has authored
        const userCommentIds = allComments?.filter(c => c.author_id === userProfile.user_id).map(c => c.id);

        if (!userCommentIds || userCommentIds.length === 0) {
            return;
        }

        // Create a new channel that only listens for replies to the current user's comments
        const channel = supabase
            .channel(`replies_to_${userProfile.user_id}`)
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'social_post_comments',
                    filter: `parent_comment_id=in.(${userCommentIds.join(',')})`
                },
                () => {
                    console.log('New reply received. Reconciling...');
                    reconcileRemoteComments();
                }
            )
            .subscribe();

        // Cleanup function to unsubscribe
        return () => {
            if (channel) {
                supabase.removeChannel(channel);
            }
        };

    }, [userProfile, allComments]); // Re-subscribe when the user's comments change


    // New useEffect for interval-based general updates
    useEffect(() => {
        const intervalId = setInterval(() => {
            console.log("Polling for new comments...");
            reconcileRemoteComments();
        }, 30000); // Poll every 30 seconds

        // Cleanup function to clear the interval
        return () => clearInterval(intervalId);
    }, [postId]);


    // Trigger local-to-remote sync on component mount
    useEffect(() => {
        syncComments();
    }, [allComments]);

    // Update handleAddComment to handle replies
    const handleAddComment = async (commentContent: string, parentId: number | null = null) => {
        if (!userProfile || !commentContent.trim()) {
            console.error("User not logged in or comment is empty.");
            return;
        }

        // Add comment to local DB first (instant UI update)
        try {
            const tempId = -Date.now();
            let parentComment: LocalComment | undefined;
            let path: (number)[] = [tempId];
            let depth = 0;

            // If a parentId exists, get the parent comment and calculate depth/path
            if (parentId) {
                parentComment = await db.social_post_comments.get(parentId);
                if (parentComment && parentComment.path) {
                    depth = parentComment.depth + 1;
                    path = [...parentComment.path, tempId];
                }
            }

            const newComment: LocalComment = {
                id: tempId,
                post_id: postId,
                author_id: userProfile.user_id,
                comment_content: commentContent,
                depth: depth,
                parent_comment_id: parentId,
                path: path,
                synced: 0,
                created_at: new Date(),
                status: 'pending' // Default status for local comment
            };

            await db.social_post_comments.add(newComment);

            console.log("Comment added locally. Syncing with server...");

            syncComments();

        } catch (err) {
            console.error("Error adding comment to local DB:", err);
        }
    };

    // --- End Offline-First Logic ---

    if (userLoading || !allComments || !commentUserProfiles) {
        return <div className='comment-block'>Loading comments...</div>;
    }

    const handleReplyClick = (parentId: number) => {
        setActiveReplyParentId(activeReplyParentId === parentId ? null : parentId);
    };

    const handleLoadMoreComments = () => {
        setVisibleComments(prevCount => prevCount + 3);
    };

    const rootComments = allComments
        .filter(c => c.parent_comment_id === null)
        .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

    const displayedRootComments = rootComments.slice(0, visibleComments);

    return (
        <div className='comment-block'>
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-bold">Comments</h3>
                <button
                    onClick={reconcileRemoteComments}
                    className="text-sm text-blue-500 font-semibold hover:underline"
                >
                    Reload Comments
                </button>
            </div>
            {rootComments.length === 0 ? (
                <p>No comments yet. Be the first to comment!</p>
            ) : (
                <div>
                    {displayedRootComments.map(comment => (
                        <Comment
                            key={comment.id}
                            comment={comment}
                            onReply={handleReplyClick}
                            allComments={allComments}
                            activeReplyParentId={activeReplyParentId}
                            userAvatarUrl={userProfile?.profileImage || '/default-avatar.jpg'}
                            userProfile={userProfile}
                            onAddComment={handleAddComment}
                        />
                    ))}
                    {rootComments.length > displayedRootComments.length && (
                        <div className="text-center mt-4">
                            <a onClick={handleLoadMoreComments} className="text-blue-500 font-semibold cursor-pointer">
                                View more comments
                            </a>
                        </div>
                    )}
                </div>
            )}

            <AddCommentInput userProfile={userProfile} onAddComment={handleAddComment} />
        </div>
    );
}