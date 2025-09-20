// app/components/CommentsSection.tsx

'use client';

import Image from 'next/image';
import { useState, useEffect, useCallback, useRef } from 'react';
import { formatRelativeTime, pluralize } from '@/app/lib/utils';
import { db, LocalComment, LocalUserProfile, LocalPost, LocalCommentImage } from '@/app/lib/local-db';
import { useLiveQuery } from 'dexie-react-hooks';
import { useUser } from '@/app/context/user-context';
import '@/app/styles/comments.css';
import AddCommentInput from './AddCommentInput';
import { SlOptions, SlPencil, SlTrash, SlShield, SlCup, SlBadge } from "react-icons/sl";
import { syncLocalComments } from '@/app/lib/supabase-sync-utils';
import type { OutputFileEntry, OutputCollectionState } from '@uploadcare/react-uploader';
import { FileUploaderRegular } from '@uploadcare/react-uploader';
import '@uploadcare/react-uploader/core.css';
import { trackEvent } from '@/app/lib/analytics';
import toast from 'react-hot-toast';
import { parseBBCode } from '@/app/lib/bbcode-parser';
import Dexie from 'dexie';
import Reactions from './Reactions';

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
    onUpdate: (commentId: number, newContent: string, newFiles: OutputFileEntry[], deletedImageIds: number[]) => void; 
    onReport: (commentId: number) => void; 
}

const CommentImages = ({ images }: { images: LocalCommentImage[] }) => {
    if (!images || images.length === 0) {
        return null;
    }
    const processImageUrl = (url: string) => {
        return url.includes("ucarecdn.com") ? `${url}-/preview/400x400/` : url;
    };
    const imageCount = images.length;
    const gridClassName = ['one', 'two', 'three', 'four'][Math.min(imageCount, 4) - 1] || 'one';
    const imagesToDisplay = images.slice(0, 4);
    return (
        <div className={`post-images ${gridClassName}`}>
            {imagesToDisplay.map((img, idx) => {
                if (idx === 3 && imageCount > 4) {
                    return (
                        <div key={img.id} style={{ position: 'relative' }}>
                            <Image
                                src={processImageUrl(img.image_url)}
                                alt={`Comment image ${idx + 1}`}
                                width={400}
                                height={400}
                                style={{ objectFit: 'cover', width: '100%', height: '100%' }}
                            />
                            <div className="overlay">+{imageCount - 4}</div>
                        </div>
                    );
                }
                return (
                    <Image
                        key={img.id}
                        src={processImageUrl(img.image_url)}
                        alt={`Comment image ${idx + 1}`}
                        width={400}
                        height={400}
                        style={{ objectFit: 'cover', width: '100%', height: '100%' }}
                    />
                );
            })}
        </div>
    );
};

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
    const [newlyUploadedFiles, setNewlyUploadedFiles] = useState<OutputFileEntry[]>([]);
    const [imagesToDelete, setImagesToDelete] = useState<number[]>([]);
    
    const authorProfile: LocalUserProfile | undefined = useLiveQuery(() => db.userProfile.where('user_id').equals(comment.author_id).first(), [comment.author_id]);
    const replies: LocalComment[] | undefined = useLiveQuery(() => db.social_post_comments.where({ parent_comment_id: comment.id }).and(c => !c.is_deleted).sortBy('created_at').then(res => res.reverse()), [comment.id]);
    const commentImages: LocalCommentImage[] | undefined = useLiveQuery(() => db.social_comment_images.where({ comment_id: comment.id }).toArray(), [comment.id]);

    useEffect(() => { const handleClickOutside = (event: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(event.target as Node)) setIsMenuOpen(false); }; document.addEventListener("mousedown", handleClickOutside); return () => document.removeEventListener("mousedown", handleClickOutside); }, []);
    
    const handleUpdateSubmit = () => {
        onUpdate(comment.id, editedContent, newlyUploadedFiles, imagesToDelete);
        setIsEditing(false);
        setNewlyUploadedFiles([]);
        setImagesToDelete([]);
    };
    const handleUploadChange = (data: OutputCollectionState) => {
        if (data.allEntries) {
            setNewlyUploadedFiles(data.allEntries);
        }
    };
    const handleMarkImageForDeletion = (imageId: number) => {
        setImagesToDelete(prev => [...prev, imageId]);
    };
    
    const hasVisibleReplies = allComments.some(c => c.parent_comment_id === comment.id && !c.is_deleted);
    if (comment.is_deleted && !hasVisibleReplies) return null;
    if (!authorProfile && !comment.is_deleted) return <div className="comment-block" style={{ marginLeft: `${comment.depth * 40}px` }}>Loading...</div>;
    
    const authorAvatar = authorProfile?.profileImage || defaultAvatar;
    const isCommentOwner = userProfile?.user_id === comment.author_id;
    const isPostAuthor = postAuthorId && comment.author_id === postAuthorId;
    
    const parsedCommentContent = parseBBCode(comment.comment_content);

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
                                <div className='flex items-center'>
                                    <span className='username'>{authorProfile?.displayName || 'Unknown User'}</span>
                                    {isPostAuthor && (
                                        <span className='author-badge ml-[8px]'>
                                            <SlBadge size={10} /> Post Author
                                        </span>
                                    )}
                                </div>
                                <span className='comment-date'>{formatRelativeTime(new Date(comment.created_at))}</span>
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
                                <p className="edit-section-header">Manage Images</p>
                                <div className="image-preview-container edit-mode">
                                    {commentImages?.filter(img => !imagesToDelete.includes(img.id)).map(image => (
                                        <div key={image.id} className="thumbnail">
                                            <Image src={`${image.image_url}-/preview/100x100/`} alt="Existing image" width={60} height={60} className="thumbnail-image" />
                                            <button onClick={() => handleMarkImageForDeletion(image.id)} className="remove-button">×</button>
                                        </div>
                                    ))}
                                    {newlyUploadedFiles.map((file, index) => (
                                         <div key={file.uuid || index} className="thumbnail">
                                            {file.cdnUrl && <Image src={`${file.cdnUrl}-/preview/100x100/`} alt="New image" width={60} height={60} className="thumbnail-image" />}
                                         </div>
                                    ))}
                                </div>

                                <div className='uploader-regular-container mt-2'>
                                    <FileUploaderRegular
                                        pubkey={process.env.NEXT_PUBLIC_UPLOADCARE_PUBLIC_KEY || ''}
                                        multiple imgOnly sourceList='local, url, camera'
                                        onChange={handleUploadChange} classNameUploader="uc-light"
                                    />
                                </div>

                                <div className="edit-actions">
                                    <button onClick={() => { setIsEditing(false); setNewlyUploadedFiles([]); setImagesToDelete([]); }}>Cancel</button>
                                    <button onClick={handleUpdateSubmit}>Save</button>
                                </div>
                            </div>
                        ) : (
                           <div className="comment-content">
                                {isCommentOwner && (comment.status !== 'approved') && (
                                    <span className={`status-badge ${comment.status}`}>
                                        {comment.status === 'pending' && 'Pending Moderation'}
                                        {comment.status === 'flagged' && (<>Moderation Failed <a href="#" className="appeal-link" onClick={(e) => e.preventDefault()}> (Appeal)</a></>)}
                                        {comment.status === 'appealed' && 'Pending Appeal'}
                                        {comment.status === 'reported' && 'Comment Reported'}
                                    </span>
                                )}
                                
                                {comment.comment_content && <div dangerouslySetInnerHTML={{ __html: parsedCommentContent }} />}

                                {commentImages && commentImages.length > 0 && (
                                    <CommentImages images={commentImages} />
                                )}
                            </div>
                        )}
                        <div className="comment-info">
                            <Reactions 
                                entityId={comment.id} 
                                entityType="comment" 
                                userProfile={userProfile} 
                                displayStyle="text" 
                            />
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

export default function CommentsSection({ postId }: { postId: number }) {
    const { userProfile, loading: userLoading, supabase, isDbReady } = useUser();
    const [activeReplyParentId, setActiveReplyParentId] = useState<number | null>(null);
    const [visibleComments, setVisibleComments] = useState(3);
    const [expandedReplies, setExpandedReplies] = useState<Set<number>>(new Set());
    const [queuedComments, setQueuedComments] = useState<LocalComment[]>([]);
    const [queuedDeletions, setQueuedDeletions] = useState<LocalComment[]>([]);

    const post: LocalPost | undefined = useLiveQuery(() => db.social_posts.get(postId),[postId]);
    
    useEffect(() => {
        if (!supabase || !userProfile) return;
        const channel = supabase.channel(`comments-for-post-${postId}`)
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'social_post_comments', filter: `post_id=eq.${postId}`}, 
            async (payload) => {
                const newComment = payload.new as LocalComment;
                if (newComment.author_id === userProfile.user_id) return;
                setQueuedComments(prev => [...prev, newComment]);
                const senderProfile = await db.userProfile.get(newComment.author_id);
                if (!senderProfile) {
                    const { data } = await supabase.from('user_profile').select('*').eq('user_id', newComment.author_id).single();
                    if (data) await db.userProfile.put(data);
                }
            })
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'social_post_comments', filter: `post_id=eq.${postId}`},
            (payload) => {
                const updatedComment = payload.new as LocalComment;
                if (updatedComment.is_deleted) {
                    setQueuedDeletions(prev => [...prev, updatedComment]);
                } else {
                    db.social_post_comments.put(updatedComment);
                }
            })
            .subscribe();
        return () => { supabase.removeChannel(channel); };
    }, [supabase, userProfile, postId]);

    useEffect(() => {
        let timer: NodeJS.Timeout | undefined;
        if (queuedComments.length > 0 || queuedDeletions.length > 0) {
            timer = setTimeout(async () => {
                const commentsToAdd = queuedComments.length;
                const commentsToRemove = queuedDeletions.length;
                const netChange = commentsToAdd - commentsToRemove;
                if (netChange !== 0) {
                    await db.social_posts.where({ id: postId }).modify(post => {
                        post.totalcomments = (post.totalcomments || 0) + netChange;
                    });
                }
                if (commentsToAdd > 0) {
                    await db.social_post_comments.bulkPut(queuedComments);
                    setQueuedComments([]);
                }
                if (commentsToRemove > 0) {
                    await db.social_post_comments.bulkPut(queuedDeletions);
                    setQueuedDeletions([]);
                }
            }, 180000);
        }
        return () => { if (timer) clearTimeout(timer); };
    }, [queuedComments, queuedDeletions, postId]);

    if (userLoading || !isDbReady) return <div className='comment-block'>Loading comments...</div>;

    const allComments: LocalComment[] | undefined = useLiveQuery(() => db.social_post_comments.where('post_id').equals(postId).and(c => c.status === 'approved' || c.author_id === userProfile?.user_id).toArray(), [postId, userProfile?.user_id]);

    const handleDeleteComment = async (commentId: number) => {
        trackEvent('comment_deleted', { post_id: postId, comment_id: commentId });
        await db.social_posts.where({ id: postId }).modify(post => {
            if (post.totalcomments > 0) post.totalcomments--;
        });
        await db.social_post_comments.update(commentId, { is_deleted: true, synced: 0 });
        syncLocalComments();
        toast.success('Comment deleted successfully.');
    };
    const handleUpdateComment = async (commentId: number, newContent: string, newFiles: OutputFileEntry[], deletedImageIds: number[]) => {
        trackEvent('comment_updated', { post_id: postId, comment_id: commentId, new_images_count: newFiles.length, deleted_images_count: deletedImageIds.length });
        await db.social_post_comments.update(commentId, { comment_content: newContent, status: 'pending', synced: 0, newImages: newFiles, deletedImages: deletedImageIds });
        syncLocalComments();
        toast.success('Comment updated successfully.');
    };
    
    const handleReportComment = async (commentId: number) => {
        if (!supabase) return;
        trackEvent('comment_reported', { post_id: postId, comment_id: commentId });
        await db.social_post_comments.update(commentId, { status: 'reported' });
        const { error } = await supabase.rpc('report_comment', { comment_id_to_report: commentId });
        toast.success('Comment reported successfully.');
        if (error) { console.error("Failed to report comment on server:", error); await db.social_post_comments.update(commentId, { status: 'approved' }); toast.error('Something went wrong. Please try again.'); }
    };
    const handleAddComment = async (commentContent: string, parentId: number | null = null, files: OutputFileEntry[] = []) => {
        if (!userProfile || (!commentContent.trim() && files.length === 0)) return;
        try {
            trackEvent('comment_created', { post_id: postId, has_images: files.length > 0, is_reply: parentId !== null });
            await db.social_posts.where({ id: postId }).modify(post => { post.totalcomments++; });
            toast.success('Comment submitted successfully.');
            const tempId = -Date.now();
            let parentComment = parentId ? await db.social_post_comments.get(parentId) : undefined;
            const depth = parentComment ? parentComment.depth + 1 : 0;
            const imagesToStore = files.map(file => ({ uuid: file.uuid, cdnUrl: file.cdnUrl })) as any[];
            const newComment: LocalComment = { id: tempId, post_id: postId, author_id: userProfile.user_id, comment_content: commentContent, depth, parent_comment_id: parentId, path: [], synced: 0, created_at: new Date(), status: 'pending', is_deleted: false, images: imagesToStore };
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
        setExpandedReplies(prev => { const newSet = new Set(prev); if (newSet.has(commentId)) newSet.delete(commentId); else newSet.add(commentId); return newSet; });
    };
    
    if (!allComments) return <div className='comment-block'></div>;
    
    const rootComments = allComments.filter(c => c.parent_comment_id === null).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    const displayedRootComments = rootComments.slice(0, visibleComments);
    const handleReplyClick = (parentId: number) => setActiveReplyParentId(activeReplyParentId === parentId ? null : parentId);
    const handleLoadMoreComments = () => setVisibleComments(prevCount => prevCount + 3);

    return (
        <div className='comment-block'>
            <div className="flex justify-between items-center mt-[10px] align-middle">
                <div className="comments">Comments</div>
            </div>
            {rootComments.length === 0 ? (
                <p className="text-center mt-[12px]">No comments yet. Be the first to comment...</p>
            ) : (
                <div>
                    {displayedRootComments.map(comment => ( 
                        <Comment key={comment.id} comment={comment} postAuthorId={post?.author_id} onReply={handleReplyClick} allComments={allComments} activeReplyParentId={activeReplyParentId} userProfile={userProfile} onAddComment={handleAddComment} expandedReplies={expandedReplies} onToggleReplies={handleToggleReplies} onDelete={handleDeleteComment} onUpdate={handleUpdateComment} onReport={handleReportComment}/> 
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