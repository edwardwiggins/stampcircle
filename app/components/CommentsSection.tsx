'use client';

import Image from 'next/image';
import { useState, useEffect, useCallback, useRef } from 'react';
import { formatRelativeTime, pluralize } from '@/app/lib/utils';
// **UPDATED**: Import LocalCommentImage
import { db, LocalComment, LocalUserProfile, LocalPost, LocalCommentImage } from '@/app/lib/local-db';
import { useLiveQuery } from 'dexie-react-hooks';
import { useUser } from '@/app/context/user-context';
import '@/app/styles/comments.css';
import AddCommentInput from './AddCommentInput';
import { SlOptions, SlPencil, SlTrash, SlShield, SlCup, SlBadge } from "react-icons/sl";
import { syncLocalComments } from '@/app/lib/supabase-sync-utils';
import type { OutputFileEntry } from '@uploadcare/react-uploader';

interface CommentProps { 
    comment: LocalComment; 
    postAuthorId?: string;
    onReply: (parentId: number) => void; 
    allComments: LocalComment[]; 
    activeReplyParentId: number | null; 
    userProfile: LocalUserProfile | null; 
    onAddComment: (commentContent: string, parentId: number | null, files: OutputFileEntry[]) => void; 
    expandedReplies: Set<number>; 
    onToggleReplies: (commentId: number) => void; 
    onDelete: (commentId: number) => void; 
    onUpdate: (commentId: number, newContent: string) => void; 
    onReport: (commentId: number) => void; 
}

// --- Standalone Comment Component ---
const Comment = ({ 
    comment, 
    postAuthorId,
    onReply, 
    allComments, 
    activeReplyParentId, 
    userProfile, 
    onAddComment, 
    expandedReplies, 
    onToggleReplies, 
    onDelete, 
    onUpdate, 
    onReport 
}: CommentProps) => {
    const defaultAvatar = '/default-avatar.jpg';
    const deletedAvatar = '/deleted_User.jpg'; 
    const isExpanded = expandedReplies.has(comment.id);
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [editedContent, setEditedContent] = useState(comment.comment_content);
    const menuRef = useRef<HTMLDivElement>(null);
    const authorProfile: LocalUserProfile | undefined = useLiveQuery(() => db.userProfile.where('user_id').equals(comment.author_id).first(), [comment.author_id]);
    const replies: LocalComment[] | undefined = useLiveQuery(() => db.social_post_comments.where({ parent_comment_id: comment.id }).and(c => !c.is_deleted).sortBy('created_at').then(res => res.reverse()), [comment.id]);

    // **NEW**: Fetch the images associated with this specific comment from the local DB.
    const commentImages: LocalCommentImage[] | undefined = useLiveQuery(
        () => db.social_comment_images.where({ comment_id: comment.id }).toArray(),
        [comment.id]
    );

    useEffect(() => { const handleClickOutside = (event: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(event.target as Node)) setIsMenuOpen(false); }; document.addEventListener("mousedown", handleClickOutside); return () => document.removeEventListener("mousedown", handleClickOutside); }, []);
    const handleUpdateSubmit = () => { if (editedContent.trim() && editedContent !== comment.comment_content) { onUpdate(comment.id, editedContent); } setIsEditing(false); };
    const hasVisibleReplies = allComments.some(c => c.parent_comment_id === comment.id && !c.is_deleted);
    if (comment.is_deleted && !hasVisibleReplies) return null;
    if (!authorProfile && !comment.is_deleted) return <div className="comment-block" style={{ marginLeft: `${comment.depth * 40}px` }}>Loading...</div>;
    
    const authorAvatar = authorProfile?.profileImage || defaultAvatar;
    const isCommentOwner = userProfile?.user_id === comment.author_id;
    const isPostAuthor = postAuthorId && comment.author_id === postAuthorId;

    return (
        <div key={comment.id}>
            <div className="comment-thread" style={{ marginLeft: `${comment.depth * 40}px` }}>
                {comment.is_deleted ? (
                    <>
                        <div className="comment-heading">
                            <Image className='comment-avatar' src={deletedAvatar} alt="Deleted Comment" width={40} height={40} />
                            <div className='user-info'>
                                <span className='username' style={{cursor: 'auto'}}>[Unknown User]</span>
                            </div>
                        </div>
                        <div className="deleted-placeholder-content">
                            <p>[This comment has been deleted]</p>
                        </div>
                    </>
                ) : (
                    <>
                        <div className="comment-heading">
                            <Image className='comment-avatar' src={authorAvatar} alt="Avatar" width={40} height={40} />
                            <div className='user-info'>
                                <span className='username'>{authorProfile?.displayName || 'Unknown User'}</span>
                                <span className='comment-date'>{formatRelativeTime(new Date(comment.created_at))}</span>
                                {isCommentOwner && !isPostAuthor && (<span className='comment-date'><SlCup size={10} /> Author</span>)}
                                {isPostAuthor && (
                                    <span className='author-badge'>
                                        <SlBadge size={10} /> Post Author
                                    </span>
                                )}
                            </div>
                            <div className="comment-options" ref={menuRef}>
                                <SlOptions size={28} className="options-icon" onClick={() => setIsMenuOpen(!isMenuOpen)} />
                                {isMenuOpen && (
                                    <div className="context-menu">
                                        {isCommentOwner ? (
                                            <>
                                                <div onClick={() => { setIsEditing(true); setIsMenuOpen(false); }}><SlPencil size={16} className='context-menu-icon'/>Edit Comment</div>
                                                <div onClick={() => { onDelete(comment.id); setIsMenuOpen(false); }}><SlTrash size={16} className='context-menu-icon'/>Delete Comment</div>
                                            </>
                                        ) : (
                                            <div onClick={() => { onReport(comment.id); setIsMenuOpen(false); }}><SlShield size={16} className='context-menu-icon'/>Report Comment</div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                        {isEditing ? (
                            <div className="edit-comment-container">
                                <textarea value={editedContent} onChange={(e) => setEditedContent(e.target.value)} className="edit-textarea" rows={3} />
                                <div className="edit-actions">
                                    <button onClick={() => { setIsEditing(false); setEditedContent(comment.comment_content); }}>Cancel</button>
                                    <button onClick={handleUpdateSubmit}>Save</button>
                                </div>
                            </div>
                        ) : (
                            <div className="comment-content">
                                {isCommentOwner && (comment.status === 'pending' || comment.status === 'flagged' || comment.status === 'appealed' || comment.status === 'reported') && (
                                    <span className={`status-badge ${comment.status}`}>
                                        {comment.status === 'pending' && 'Pending Moderation'}
                                        {comment.status === 'flagged' && (<>Moderation Failed <a href="#" className="appeal-link" onClick={(e) => e.preventDefault()}> (Appeal)</a></>)}
                                        {comment.status === 'appealed' && 'Pending Appeal'}
                                        {comment.status === 'reported' && 'Comment Reported'}
                                    </span>
                                )}
                                {comment.comment_content && <p>{comment.comment_content}</p>}

                                {/* **NEW**: Conditionally render the image gallery if images exist */}
                                {commentImages && commentImages.length > 0 && (
                                    <div className="comment-image-gallery">
                                        {commentImages.map(image => (
                                            <div key={image.id} className="comment-image-wrapper">
                                                <Image 
                                                    src={`${image.image_url}-/preview/200x200/`}
                                                    alt="Comment image"
                                                    width={200}
                                                    height={200}
                                                    className="comment-image"
                                                />
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                        <div className="comment-info">
                            <div className="comment-response">Like</div>
                            <div className="comment-response" onClick={() => onReply(comment.id)}>Reply</div>
                        </div>
                    </>
                )}
                {hasVisibleReplies && (
                    <div className="more-replies" onClick={() => onToggleReplies(comment.id)}>
                        {isExpanded ? `Hide ${pluralize(replies?.length || 0, 'reply', 'replies')}` : `View ${pluralize(replies?.length || 0, 'reply', 'replies')}`}
                    </div>
                )}
                {!comment.is_deleted && activeReplyParentId === comment.id && (
                    <div className="reply-form-container mt-2" style={{ marginLeft: '40px' }}>
                        <AddCommentInput userProfile={userProfile} onAddComment={onAddComment} parentId={comment.id} />
                    </div>
                )}
            </div>
            {isExpanded && replies && replies.length > 0 && (
                <div className="replies-container">
                    {replies.map(reply => ( 
                        <Comment 
                            key={reply.id} 
                            comment={reply} 
                            postAuthorId={postAuthorId}
                            onReply={onReply} 
                            allComments={allComments} 
                            activeReplyParentId={activeReplyParentId} 
                            userProfile={userProfile} 
                            onAddComment={onAddComment} 
                            expandedReplies={expandedReplies} 
                            onToggleReplies={onToggleReplies} 
                            onDelete={onDelete} 
                            onUpdate={onUpdate} 
                            onReport={onReport}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};


// --- Main CommentsSection Component ---
export default function CommentsSection({ postId }: { postId: number }) {
    const { userProfile, loading: userLoading, supabase, isDbReady } = useUser();
    const [activeReplyParentId, setActiveReplyParentId] = useState<number | null>(null);
    const [visibleComments, setVisibleComments] = useState(3);
    const [expandedReplies, setExpandedReplies] = useState<Set<number>>(new Set());
    const [isReloading, setIsReloading] = useState(false);
    
    const post: LocalPost | undefined = useLiveQuery(
        () => db.social_posts.get(postId),
        [postId]
    );
    
    if (userLoading || !isDbReady) {
        return <div className='comment-block'>Loading comments...</div>;
    }

    const allComments: LocalComment[] | undefined = useLiveQuery(
        () => db.social_post_comments
            .where('post_id').equals(postId)
            .and(c => c.status === 'approved' || c.author_id === userProfile?.user_id)
            .toArray(),
        [postId, userProfile?.user_id]
    );

    const handleDeleteComment = async (commentId: number) => {
        const postToUpdate = await db.social_posts.get(postId);
        if (postToUpdate) {
            await db.social_posts.update(postId, { totalcomments: (postToUpdate.totalcomments || 1) - 1 });
        }
        await db.social_post_comments.update(commentId, { is_deleted: true, synced: 0 });
        syncLocalComments();
    };

    const handleUpdateComment = async (commentId: number, newContent: string) => {
        await db.social_post_comments.update(commentId, { comment_content: newContent, status: 'pending', synced: 0 });
        syncLocalComments();
    };
    
    const handleReportComment = async (commentId: number) => {
        if (!supabase) return;
        await db.social_post_comments.update(commentId, { status: 'reported' });
        const { error } = await supabase.rpc('report_comment', { comment_id_to_report: commentId });
        if (error) { 
            console.error("Failed to report comment on server:", error);
            await db.social_post_comments.update(commentId, { status: 'approved' });
        }
    };

    const handleAddComment = async (commentContent: string, parentId: number | null = null, files: OutputFileEntry[] = []) => {
        if (!userProfile || (!commentContent.trim() && files.length === 0)) return;
        try {
            const postToUpdate = await db.social_posts.get(postId);
            if (postToUpdate) {
                await db.social_posts.update(postId, { totalcomments: (postToUpdate.totalcomments || 0) + 1 });
            }

            const tempId = -Date.now();
            let parentComment = parentId ? await db.social_post_comments.get(parentId) : undefined;
            const depth = parentComment ? parentComment.depth + 1 : 0;
            
            const newComment: LocalComment = { 
                id: tempId, 
                post_id: postId, 
                author_id: userProfile.user_id, 
                comment_content: commentContent, 
                depth, 
                parent_comment_id: parentId, 
                path: [], 
                synced: 0,
                created_at: new Date(),
                status: 'pending', 
                is_deleted: false,
                images: files
            };
            
            await db.social_post_comments.add(newComment);

            if (parentId) {
                setActiveReplyParentId(null);
                setExpandedReplies(prev => new Set(prev).add(parentId));
            }
            syncLocalComments();
        } catch (err) {
            console.error("Error adding comment to local DB:", err);
        }
    };

    const handleToggleReplies = (commentId: number) => {
        setExpandedReplies(prev => {
            const newSet = new Set(prev);
            if (newSet.has(commentId)) newSet.delete(commentId);
            else newSet.add(commentId);
            return newSet;
        });
    };
    
    const fetchAndStoreComments = useCallback(async () => {
        if (!supabase || !navigator.onLine) return;
        try {
            const { data: remoteComments, error } = await supabase.from('social_post_comments').select('*, social_comment_images(*)');
            if (error) throw error;

            if (remoteComments) {
                const authorIds = [...new Set(remoteComments.map(c => c.author_id))];
                if (authorIds.length > 0) {
                    const { data: profiles } = await supabase.from('user_profile').select('*').in('user_id', authorIds);
                    if (profiles) await db.userProfile.bulkPut(profiles);
                }
                
                const commentsToStore: LocalComment[] = [];
                const imagesToStore: LocalCommentImage[] = [];

                remoteComments.forEach(comment => {
                    const { social_comment_images, ...commentData } = comment;
                    commentsToStore.push({ ...commentData, created_at: new Date(commentData.created_at), synced: 1 });
                    if (social_comment_images) {
                        imagesToStore.push(...social_comment_images);
                    }
                });

                await db.social_post_comments.bulkPut(commentsToStore);
                await db.social_comment_images.bulkPut(imagesToStore);
            }
        } catch (err) {
            console.error('Failed to fetch and store comments:', err);
        }
    }, [postId, supabase]);

    const handleReloadClick = async () => {
        setIsReloading(true);
        try {
            await fetchAndStoreComments();
            await syncLocalComments();
        } finally {
            setIsReloading(false);
        }
    };

    useEffect(() => {
        if (userProfile?.user_id && isDbReady) {
            fetchAndStoreComments();
            syncLocalComments();
        }
    }, [userProfile?.user_id, isDbReady, fetchAndStoreComments]);
    
    if (!allComments) return <div className='comment-block'>Loading comments...</div>;
    
    const rootComments = allComments.filter(c => c.parent_comment_id === null).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    const displayedRootComments = rootComments.slice(0, visibleComments);
    const handleReplyClick = (parentId: number) => setActiveReplyParentId(activeReplyParentId === parentId ? null : parentId);
    const handleLoadMoreComments = () => setVisibleComments(prevCount => prevCount + 3);

    return (
        <div className='comment-block'>
            <div className="flex justify-between items-center mt-[10px] align-middle">
                <div className="comments">Comments</div>
                <button 
                    className='comments-button' 
                    onClick={handleReloadClick}
                    disabled={isReloading}
                >
                    {isReloading ? 'Reloading comments...' : 'Reload comments'}
                </button>
            </div>
            {rootComments.length === 0 ? (
                <p className="text-center mt-[12px]">No comments yet. Be the first to comment...</p>
            ) : (
                <div>
                    {displayedRootComments.map(comment => ( 
                        <Comment 
                            key={comment.id} 
                            comment={comment}
                            postAuthorId={post?.author_id}
                            onReply={handleReplyClick} 
                            allComments={allComments} 
                            activeReplyParentId={activeReplyParentId} 
                            userProfile={userProfile} 
                            onAddComment={handleAddComment} 
                            expandedReplies={expandedReplies} 
                            onToggleReplies={handleToggleReplies} 
                            onDelete={handleDeleteComment} 
                            onUpdate={handleUpdateComment} 
                            onReport={handleReportComment}
                        /> 
                    ))}
                    {rootComments.length > displayedRootComments.length && (
                        <div className="text-center mt-[12px]">
                            <a onClick={handleLoadMoreComments} className="text-blue-500 font-semibold cursor-pointer">View more comments</a>
                        </div>
                    )}
                </div>
            )}
            <AddCommentInput userProfile={userProfile} onAddComment={handleAddComment} />
        </div>
    );
}