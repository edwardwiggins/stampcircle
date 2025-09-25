// app/components/postCard.tsx
'use client';

import { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { formatRelativeTime, pluralize } from '@/app/lib/utils';
import { parseBBCode } from '@/app/lib/bbcode-parser';
import { db, LocalPost, LocalUserProfile, LocalSavedPost, LocalPostImage, LocalSocialTag } from '@/app/lib/local-db';
import { SlBubble, SlShareAlt, SlLink, SlOptions, SlPencil, SlTrash, SlShield, SlPaperClip, SlExclamation, SlBan, SlUserFollow, SlUserUnfollow, SlUser, SlPeople, SlClock } from "react-icons/sl"; 
import { BiCaretRight } from "react-icons/bi";
import CommentsSection from './CommentsSection';
import { useLiveQuery } from 'dexie-react-hooks';
import { useInView } from 'react-intersection-observer';
import { trackEvent } from '@/app/lib/analytics';
import { FileUploaderRegular } from '@uploadcare/react-uploader';
import '@uploadcare/react-uploader/core.css';
import type { OutputFileEntry, OutputCollectionState } from '@uploadcare/react-uploader';
import Reactions from './Reactions';
import SharePostModal from './SharePostModal';
import { syncLocalPosts, syncUserSocialGraph } from '@/app/lib/supabase-sync-utils';
import toast from 'react-hot-toast';
import supabase from '@/app/lib/client-supabase';

import { MentionsInput, Mention } from 'react-mentions';
import '@/app/styles/mentions-input.css';

import RelationshipBadge from './RelationshipBadge';
import SocialProof from './SocialProof';
import { useRelationshipStatus } from '@/app/hooks/useRelationshipStatus';

const PostTags = ({ tags }: { tags: LocalSocialTag[] }) => {
    if (!tags || tags.length === 0) {
        return null;
    }

    return (
        <div className="post-tags-container flex flex-wrap items-center mt-4">
            {tags.map(tag => (
                <Link href={`/hashtags/${tag.tag_name}`} key={tag.id} className="post-tag mr-2 mb-2">
                    {tag.tag_displayname}
                </Link>
            ))}
        </div>
    );
};


interface PostCardProps {
    post: LocalPost;
    userProfile: LocalUserProfile | null;
    onUpdate: (postId: number, newContent: string, newFiles: OutputFileEntry[], deletedImageIds: number[], allowComments: boolean) => void;
    onDelete: (postId: number) => void;
    onReport: (postId: number) => void;
    onBlockUser: (userId: string) => void;
    onSavePost: (postId: number, isCurrentlySaved: boolean) => void;
    showActions?: boolean;
}

interface UserPostProps extends Omit<PostCardProps, 'showActions'> {
    showActions?: boolean;
}

const PostImages = ({ postId }: { postId: number }) => {
    const images = useLiveQuery(() => db.social_post_images.where('post_id').equals(postId).toArray(), [postId]);
    if (!images || images.length === 0) return null;
    const processImageUrl = (url: string) => url.includes("ucarecdn.com") ? `${url}-/preview/600x600/` : url;
    const imageCount = images.length;
    const gridClassName = ['one', 'two', 'three', 'four'][Math.min(imageCount, 4) - 1] || 'one';
    const imagesToDisplay = images.slice(0, 4);
    return (
        <div className={`post-images ${gridClassName}`}>
            {imagesToDisplay.map((img, idx) => {
                if (idx === 3 && imageCount > 4) {
                    return (
                        <div key={img.id} style={{ position: 'relative' }}>
                            <Image src={processImageUrl(img.image_url)} alt={`Post image ${idx + 1}`} width={600} height={600} style={{ objectFit: 'cover', width: '100%', height: '100%' }} />
                            <div className="overlay">+{imageCount - 4}</div>
                        </div>
                    );
                }
                return <Image key={img.id} src={processImageUrl(img.image_url)} alt={`Post image ${idx + 1}`} width={600} height={600} style={{ objectFit: 'cover', width: '100%', height: '100%' }} />;
            })}
        </div>
    );
};

const UserPost = ({ post, userProfile, onUpdate, onDelete, onReport, onBlockUser, onSavePost, showActions = true }: UserPostProps) => {
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [showBlockConfirm, setShowBlockConfirm] = useState(false);
    const [isShareModalOpen, setIsShareModalOpen] = useState(false);
    const [editedContent, setEditedContent] = useState(post.post_content);
    const [editedAllowComments, setEditedAllowComments] = useState(post.allow_comments ?? true);
    const menuRef = useRef<HTMLDivElement>(null);
    const defaultAvatar = '/default-avatar.jpg';
    const [newlyUploadedFiles, setNewlyUploadedFiles] = useState<OutputFileEntry[]>([]);
    const [imagesToDelete, setImagesToDelete] = useState<number[]>([]);
    const [sessionSuggestedTags, setSessionSuggestedTags] = useState<string[]>([]);
    const savedPostRecord: LocalSavedPost | undefined = useLiveQuery(() => userProfile ? db.social_saved_posts.where({ user_id: userProfile.user_id, post_id: post.id }).first() : undefined, [userProfile, post.id]);
    const isSaved = !!savedPostRecord;
    const postImages: LocalPostImage[] | undefined = useLiveQuery(() => db.social_post_images.where({ post_id: post.id }).toArray(), [post.id]);
    const { ref, inView } = useInView({ threshold: 0.5, triggerOnce: true });
    useEffect(() => { if (inView) { trackEvent('post_viewed', { post_id: post.id, author_id: post.author_id }); } }, [inView, post.id, post.author_id]);
    const authorProfile: LocalUserProfile | undefined = useLiveQuery(() => db.userProfile.where('user_id').equals(post.author_id).first(), [post.author_id]);
    const parentPost = useLiveQuery(() => post.related_post_id ? db.social_posts.get(post.related_post_id) : undefined, [post.related_post_id]);
    
    const { isConnected, isFollowing, isPending, requestSentByMe } = useRelationshipStatus(userProfile?.user_id, post.author_id);
    
    useEffect(() => { const handleClickOutside = (event: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(event.target as Node)) { setIsMenuOpen(false); } }; document.addEventListener("mousedown", handleClickOutside); return () => document.removeEventListener("mousedown", handleClickOutside); }, []);
    const handleUploadChange = (data: OutputCollectionState) => { setNewlyUploadedFiles(data.allEntries.filter(file => file.status === 'success')); };
    const handleMarkImageForDeletion = (imageId: number) => { setImagesToDelete(prev => [...prev, imageId]); };
    
    const handleFollow = async () => {
        if (!userProfile) return;
        setIsMenuOpen(false);
        const tempId = -Date.now();
        const newFollow = {
            id: tempId,
            follower_id: userProfile.user_id,
            following_id: post.author_id,
            created_at: new Date().toISOString(),
        };
        try {
            await db.social_user_follows.add(newFollow);
            toast.success(`You are now following ${authorProfile?.displayName}`);
            const { id, ...supabaseFollow } = newFollow;
            const { data, error } = await supabase.from('social_user_follows').insert(supabaseFollow).select().single();
            if (error) throw error;
            await db.transaction('rw', db.social_user_follows, async () => {
                await db.social_user_follows.delete(tempId);
                await db.social_user_follows.add(data);
            });
        } catch (e) {
            console.error(e);
            toast.error("Could not follow user.");
            await db.social_user_follows.delete(tempId);
        }
    };

    const handleUnfollow = async () => {
        if (!userProfile) return;
        setIsMenuOpen(false);
        const followRecord = await db.social_user_follows.where({ follower_id: userProfile.user_id, following_id: post.author_id }).first();
        if (followRecord) {
            await db.social_user_follows.delete(followRecord.id);
            toast.success(`You have unfollowed ${authorProfile?.displayName}`);
            if (followRecord.id > 0) {
                const { error } = await supabase.from('social_user_follows').delete().eq('id', followRecord.id);
                if (error) {
                    console.error(error);
                    toast.error("Could not unfollow user.");
                    await db.social_user_follows.add(followRecord);
                }
            }
        }
    };
    
    const handleConnect = async () => {
        if (!userProfile) return;
        setIsMenuOpen(false);
        const tempId = -Date.now();
        const newConnection = {
            id: tempId,
            user_id: userProfile.user_id,
            target_user_id: post.author_id,
            status: 'pending' as const,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        };
        try {
            await db.social_user_connections.add(newConnection);
            toast.success("Connection request sent!");
            const { id, ...supabaseConnection } = newConnection;
            const { data, error } = await supabase.from('social_user_connections').insert(supabaseConnection).select().single();
            if (error) throw error;
            await db.transaction('rw', db.social_user_connections, async () => {
                await db.social_user_connections.delete(tempId);
                await db.social_user_connections.add(data);
            });
        } catch (error) {
            toast.error("Could not send request.");
            console.error(error);
            await db.social_user_connections.delete(tempId);
        }
    };

    const handleDisconnect = async () => {
        if (!userProfile) return;
        setIsMenuOpen(false);
        const connection = await db.social_user_connections
            .where('[user_id+target_user_id]').equals([userProfile.user_id, post.author_id])
            .or('[user_id+target_user_id]').equals([post.author_id, userProfile.user_id])
            .first();
        const follow1 = await db.social_user_follows.where({ follower_id: userProfile.user_id, following_id: post.author_id }).first();
        const follow2 = await db.social_user_follows.where({ follower_id: post.author_id, following_id: userProfile.user_id }).first();
        if (connection) await db.social_user_connections.delete(connection.id);
        if (follow1) await db.social_user_follows.delete(follow1.id);
        if (follow2) await db.social_user_follows.delete(follow2.id);
        toast.success(`Disconnected from ${authorProfile?.displayName}`);
        const { error } = await supabase.rpc('disconnect_user', {
            disconnect_user_id: post.author_id
        });
        if (error) {
            toast.error("Disconnection failed to sync.");
            console.error(error);
            if (connection) await db.social_user_connections.add(connection);
            if (follow1) await db.social_user_follows.add(follow1);
            if (follow2) await db.social_user_follows.add(follow2);
        }
    };

    const handleCancelRequest = async () => {
        if (!userProfile) return;
        setIsMenuOpen(false);
        const pendingRequest = await db.social_user_connections
            .where({ user_id: userProfile.user_id, target_user_id: post.author_id, status: 'pending' })
            .first();
        if (pendingRequest) {
            await db.social_user_connections.delete(pendingRequest.id);
            toast.success("Connection request cancelled.");
            const { error } = await supabase.rpc('cancel_connection_request', {
                target_user_id_in: post.author_id
            });
            if (error) {
                toast.error("Could not cancel request.");
                console.error(error);
                await db.social_user_connections.add(pendingRequest);
            }
        }
    };
    
    const handleAcceptRequest = async () => {
        if (!userProfile) return;
        setIsMenuOpen(false);
        const { error } = await supabase.rpc('accept_connection_request', { 
            requesting_user_id_in: post.author_id 
        });
        if (error) {
            toast.error("Failed to accept request.");
            console.error(error);
        } else {
            toast.success(`You are now connected with ${authorProfile?.displayName}!`);
            syncUserSocialGraph(userProfile.user_id);
        }
    };

    const handleDeclineRequest = async () => {
        if (!userProfile) return;
        setIsMenuOpen(false);
        const pendingRequest = await db.social_user_connections
            .where({ user_id: post.author_id, target_user_id: userProfile.user_id, status: 'pending' })
            .first();
        if (pendingRequest) {
            await db.social_user_connections.delete(pendingRequest.id);
        }
        toast.success("Connection request declined.");
        const { error } = await supabase.rpc('decline_connection_request', { 
            requesting_user_id_in: post.author_id 
        });
        if (error) {
            toast.error("Failed to decline request.");
            console.error(error);
            if (pendingRequest) {
                await db.social_user_connections.add(pendingRequest);
            }
        }
    };
    
    const fetchUsers = async (query: string, callback: (data: { id: string; display: string }[]) => void) => {
        if (!query) return;
        const users = await db.userProfile
            .where('displayName').startsWithIgnoreCase(query)
            .or('username').startsWithIgnoreCase(query)
            .limit(10).toArray();
        callback(users.map(user => ({ id: user.username, display: user.displayName || user.username })));
    };

    const fetchHashtags = async (query: string, callback: (data: { id: string | number; display: string }[]) => void) => {
        if (!query) return;
        const tags = await db.social_tags
            .where('[tag_status+is_category]').equals([1, 0])
            .and(tag => tag.tag_name.toLowerCase().startsWith(query.toLowerCase()))
            .limit(5).toArray();
        const formattedTags = tags.map(tag => ({ id: tag.id, display: tag.tag_displayname }));
        const queryIsNewSuggestion = query.length > 2 && !tags.some(tag => tag.tag_name.toLowerCase() === query.toLowerCase());
        if (queryIsNewSuggestion) {
            formattedTags.push({
                id: `SUGGEST_NEW:${query}`,
                display: `Suggest #${query} as a new tag`
            });
        }
        callback(formattedTags);
    };

    const handleSuggestTag = (tagName: string) => {
        console.log(`User suggested new tag: ${tagName}`);
        setSessionSuggestedTags(prev => [...prev, tagName.toLowerCase()]);
        toast.success(`'#${tagName}' submitted for review. Thank you!`);
    };

    const validateHashtags = async (text: string): Promise<{ isValid: boolean; error?: string }> => {
        const plainTextRegex = /(?<!\S)#(\w+)/g;
        const bbCodeRegex = /#\[([^\]]+)\]\(([^)]+)\)/g;
        const bbCodeTags = new Set([...text.matchAll(bbCodeRegex)].map(m => m[1]));
        const plainTextTags = [...text.matchAll(plainTextRegex)].map(m => m[1]);
        for (const plainTag of plainTextTags) {
            if (bbCodeTags.has(`#${plainTag}`)) { continue; }
            const cleanTagName = plainTag.toLowerCase();
            if (sessionSuggestedTags.includes(cleanTagName)) { continue; }
            const existingTag = await db.social_tags.where('tag_name').equalsIgnoreCase(cleanTagName).first();
            if (!existingTag) {
                return {
                    isValid: false,
                    error: `The tag '#${plainTag}' is not an approved tag. To suggest it, please use the autocomplete menu.`
                };
            }
        }
        return { isValid: true };
    };

    const handleUpdateSubmit = async () => {
        const hashtagValidation = await validateHashtags(editedContent);
        if (!hashtagValidation.isValid) {
            toast.error(hashtagValidation.error!);
            return;
        }
        const hasTextChanged = editedContent.trim() !== post.post_content;
        const haveImagesChanged = newlyUploadedFiles.length > 0 || imagesToDelete.length > 0;
        const haveCommentsChanged = editedAllowComments !== (post.allow_comments ?? true);
        if (hasTextChanged || haveImagesChanged || haveCommentsChanged) {
            onUpdate(post.id, editedContent, newlyUploadedFiles, imagesToDelete, editedAllowComments);
        }
        setIsEditing(false);
        setNewlyUploadedFiles([]);
        setImagesToDelete([]);
    };

    const handleToggleComments = async () => {
        setIsMenuOpen(false);
        const newStatus = !(post.allow_comments ?? true);
        await db.social_posts.update(post.id, {
            allow_comments: newStatus,
            synced: 0,
        });
        syncLocalPosts();
    };

    if (!authorProfile || !userProfile) { return <div className='post-block p-4'>Loading user profile...</div>; }
    const isOwner = userProfile?.user_id === post.author_id;
    const isStampBot = post.author_id === '05492a51-479c-4372-a4f1-4e6f250471d4';
    const formattedDate = formatRelativeTime(new Date(post.created_at));
    const avatarSource = authorProfile.profileImage || defaultAvatar;
    const isOTD = post.post_type === 'OTD';
    
    const postToActuallyShare = parentPost || post;

    return (
        <div ref={ref}>
            <div className='post-heading'>
                <Image className='avatar' src={avatarSource} alt="Avatar" width={50} height={50} />
                <div className='user-info'>
                    {isOTD ? (
                        <>
                            <div className='username-container'>
                                <span className='username'>{authorProfile.displayName}</span>
                                <div><BiCaretRight size={20} className='context-menu-icon font-bold ml-[6px]'/>On this day...</div>
                            </div>
                            <span className='post-date'>{formattedDate}</span>
                        </>
                    ) : parentPost ? (
                        <>
                            <div className='username-container'>
                                <span className='username'>{authorProfile.displayName}</span>
                                <span className="ml-[4px] shared-text">shared a post</span>
                            </div>
                            <RelationshipBadge currentUserId={userProfile.user_id} authorId={post.author_id} />
                            <span className='post-date'>{formattedDate}</span>
                        </>
                    ) : (
                        <>
                            <span className='username'>{authorProfile.displayName}</span>
                            <RelationshipBadge currentUserId={userProfile.user_id} authorId={post.author_id} />
                            <span className='post-date'>{formattedDate}</span>
                        </>
                    )}
                </div>
                {showActions && (
                    <div className="comment-options" ref={menuRef}>
                        <SlOptions size={32} className="options-icon" onClick={() => setIsMenuOpen(!isMenuOpen)} />
                        {isMenuOpen && (
                            <div className="context-menu">
                                {isOwner ? (
                                    <>
                                        <div onClick={() => { setIsEditing(true); setIsMenuOpen(false); }}><SlPencil size={16} className='context-menu-icon'/>Edit Post</div>
                                        <div onClick={() => { onDelete(post.id); setIsMenuOpen(false); }}><SlTrash size={16} className='context-menu-icon'/>Delete Post</div>
                                        <div onClick={handleToggleComments}>
                                            <SlBubble size={16} className='context-menu-icon'/>
                                            {post.allow_comments !== false ? 'Turn comments off' : 'Turn comments on'}
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        {isFollowing ? (
                                            <div onClick={handleUnfollow}><SlUserUnfollow size={16} className='context-menu-icon'/>Unfollow {authorProfile.displayName}</div>
                                        ) : (
                                            <div onClick={handleFollow}><SlUserFollow size={16} className='context-menu-icon'/>Follow {authorProfile.displayName}</div>
                                        )}
                                        {isConnected ? (
                                             <div onClick={handleDisconnect}><SlPeople size={16} className='context-menu-icon'/>Disconnect from {authorProfile.displayName}</div>
                                        ) : isPending ? (
                                            requestSentByMe ? (
                                                <div onClick={handleCancelRequest}><SlClock size={16} className='context-menu-icon'/>Cancel Connection Request</div>
                                            ) : (
                                                <>
                                                    <div onClick={handleAcceptRequest}><SlUserFollow size={16} className='context-menu-icon'/>Accept Request</div>
                                                    <div onClick={handleDeclineRequest}><SlUserUnfollow size={16} className='context-menu-icon'/>Decline Request</div>
                                                </>
                                            )
                                        ) : (
                                            <div onClick={handleConnect}><SlUser size={16} className='context-menu-icon'/>Connect with {authorProfile.displayName}</div>
                                        )}
                                        <hr className="context-menu-hr" />
                                        <div onClick={() => { onSavePost(post.id, isSaved); setIsMenuOpen(false); }}><SlPaperClip size={16} className='context-menu-icon'/>{isSaved ? 'Unsave Post' : 'Save Post'}</div>
                                        <div onClick={() => { onReport(post.id); setIsMenuOpen(false); }}><SlShield size={16} className='context-menu-icon'/>Report Post</div>
                                        {!isStampBot && (<div onClick={() => { setShowBlockConfirm(true); setIsMenuOpen(false); }}><SlBan size={16} className='context-menu-icon'/>Block {authorProfile.displayName}</div>)}
                                    </>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </div>
            {(isOwner && (post.post_status !== 'approved')) && (<div className="post-status-container mb-[8px]"><span className={`status-badge ${post.post_status}`}>{post.post_status === 'pending' && 'Pending Moderation'}{post.post_status === 'flagged' && (<>Moderation Failed <a href="#" className="appeal-link" onClick={(e) => e.preventDefault()}> (Appeal)</a></>)}{post.post_status === 'appealed' && 'Pending Appeal'}{post.post_status === 'reported' && 'Post Reported'}</span></div>)}
            
            {isEditing ? (
                <div className="edit-post-container">
                    <MentionsInput
                        value={editedContent}
                        onChange={(e, newValue) => setEditedContent(newValue)}
                        className="mentions-input"
                        a11ySuggestionsListLabel={"Suggested users and hashtags"}
                    >
                        <Mention
                            trigger="@"
                            data={fetchUsers}
                            markup="@[__display__](__id__)"
                            displayTransform={(id, display) => `@${display}`}
                            className="mentions-mention"
                        />
                        <Mention
                            trigger="#"
                            data={fetchHashtags}
                            markup="#[__display__](__id__)"
                            displayTransform={(id, display) => display}
                            className="mentions-hashtag"
                        />
                    </MentionsInput>

                    <p className="edit-section-header">Manage Images</p>
                    <div className="image-preview-container edit-mode">
                        {postImages?.filter(img => !imagesToDelete.includes(img.id)).map(image => (<div key={image.id} className="thumbnail"><Image src={`${image.image_url}-/preview/100x100/`} alt="Existing image" width={60} height={60} className="thumbnail-image" /><button onClick={() => handleMarkImageForDeletion(image.id)} className="remove-button">×</button></div>))}
                        {newlyUploadedFiles.map((file, index) => (<div key={file.uuid || index} className="thumbnail">{file.cdnUrl && <Image src={`${file.cdnUrl}-/preview/100x100/`} alt="New image" width={60} height={60} className="thumbnail-image" />}</div>))}
                    </div>
                    <div className='uploader-regular-container mt-2'><FileUploaderRegular pubkey={process.env.NEXT_PUBLIC_UPLOADCARE_PUBLIC_KEY || ''} multiple imgOnly sourceList='local, url, camera, gdrive' onChange={handleUploadChange} classNameUploader="uc-light" /></div>
                    <div className="flex items-center my-4">
                        <input type="checkbox" id={`editAllowComments-${post.id}`} checked={editedAllowComments} onChange={(e) => setEditedAllowComments(e.target.checked)} className="h-6 w-6 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                        <label htmlFor={`editAllowComments-${post.id}`} className="ml-[8px] block text-sm text-gray-900">Allow comments on this post</label>
                    </div>
                    <div className="edit-actions"><button onClick={() => { setIsEditing(false); setEditedContent(post.post_content); setNewlyUploadedFiles([]); setImagesToDelete([]); setEditedAllowComments(post.allow_comments ?? true); }}>Cancel</button><button onClick={handleUpdateSubmit}>Save</button></div>
                </div>
            ) : (
                <>
                    <div className='post-content' dangerouslySetInnerHTML={{ __html: parseBBCode(post.post_content) }} />
                    <PostImages postId={post.id} />
                    {showActions && post.tags && <PostTags tags={post.tags} />}
                    {parentPost && (
                        <div className="embedded-post-container">
                            <PostCard post={parentPost} userProfile={userProfile} onUpdate={onUpdate} onDelete={onDelete} onReport={onReport} onBlockUser={onBlockUser} onSavePost={onSavePost} showActions={false}/>
                        </div>
                    )}
                </>
            )}
            
            {showActions && !isEditing && (
                <>
                    <div className="post-info">
                        <div className="post-info-reactions">
                           <SocialProof postId={post.id} currentUserId={userProfile.user_id} />
                        </div>
                        <div className="post-info-stats">
                           <p>{pluralize(post.totalcomments || 0, 'comment')} • {pluralize(post.totalshares || 0, 'share')}</p>
                        </div>
                    </div>
                    <div className="post-footer">
                        <Reactions entityId={post.id} entityType="post" userProfile={userProfile} displayStyle="button" />
                        <div className={`footer-action ${post.allow_comments === false ? 'disabled' : ''}`} data-tooltip-id="app-tooltip" data-tooltip-content={post.allow_comments === false ? "Comments are disabled for this post" : "Leave a comment"}>
                            {post.allow_comments !== false ? ( <> <SlBubble className='post-icon' size={16} /> Comment </> ) : ( <> <SlBan className='post-icon-disabled' size={16} /> Comments OFF </> )}
                        </div>
                        <div className='footer-action' onClick={() => setIsShareModalOpen(true)}>
                            <SlShareAlt className='post-icon' size={16} />Share
                        </div>
                    </div>
                </>
            )}
            
            {post.id && showActions && <CommentsSection post={post} />}

            {showBlockConfirm && (<div className="modal"><div className="modal-content"><div className='flex flex-row'><SlExclamation className='text-red-700 mr-[8px]' style={{ color: 'red' }} size={24} /><h3>Are you sure you want to block {authorProfile.displayName}?</h3></div><p>You will no longer see their posts or comments.</p><div className="modal-actions flex justify-end"><button onClick={() => setShowBlockConfirm(false)} className="close-button">Cancel</button><button onClick={() => { onBlockUser(post.author_id); setShowBlockConfirm(false); }} className="submit-button">Block</button></div></div></div>)}
            {isShareModalOpen && (<SharePostModal isOpen={isShareModalOpen} onClose={() => setIsShareModalOpen(false)} postToShare={postToActuallyShare}/>)}
        </div>
    );
};

const AdPost = ({ post }: { post: LocalPost }) => {
    const metadata = post.metadata || {};
    return (
        <>
            <div className='post-heading'>
                <div className='user-info'>
                    <span className='username'>{metadata.sponsor_name || 'Sponsored'}</span>
                    <span className='post-date'>Ad</span>
                </div>
            </div>
            {metadata.image_url && (<div className="ad-image-container my-2"><Image src={metadata.image_url} alt={post.post_content || 'Advertisement'} width={500} height={300} className="w-full h-auto object-cover rounded-md"/></div>)}
            <div className='post-content'>
                <p>{post.post_content}</p>
                {metadata.price && <p className="font-bold text-lg my-2">{metadata.price}</p>}
            </div>
            <div className="post-footer">
                <a href={metadata.target_url} target="_blank" rel="noopener noreferrer" className='footer-action w-full justify-center text-blue-500 font-bold'><SlLink className='post-icon' size={16} /> Visit Site</a>
            </div>
        </>
    );
};

export default function PostCard({ post, userProfile, onUpdate, onDelete, onReport, onBlockUser, onSavePost, showActions = true }: PostCardProps) {
    const renderContent = () => {
        switch (post.post_type) {
            case 'Ad': case 'Sponsored': return <AdPost post={post} />;
            case 'Suggestion': return <div className="p-4">Suggestion Card Placeholder</div>;
            case 'User': default:
                return <UserPost post={post} userProfile={userProfile} onUpdate={onUpdate} onDelete={onDelete} onReport={onReport} onBlockUser={onBlockUser} onSavePost={onSavePost} showActions={showActions} />;
        }
    };
    return (<div className='post-block'>{renderContent()}</div>);
}