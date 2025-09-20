'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import Image from 'next/image';
import { formatRelativeTime, pluralize } from '@/app/lib/utils';
import { parseBBCode } from '@/app/lib/bbcode-parser';
import { db, LocalPost, LocalUserProfile, LocalSavedPost, LocalPostImage } from '@/app/lib/local-db';
import { SlBubble, SlShareAlt, SlLink, SlOptions, SlPencil, SlTrash, SlShield, SlPaperClip, SlExclamation, SlBan } from "react-icons/sl"; 
import { BiCaretRight } from "react-icons/bi";
import CommentsSection from './CommentsSection';
import { useLiveQuery } from 'dexie-react-hooks';
import { useInView } from 'react-intersection-observer';
import { trackEvent } from '@/app/lib/analytics';
import { FileUploaderRegular } from '@uploadcare/react-uploader';
import '@uploadcare/react-uploader/core.css';
import type { OutputFileEntry, OutputCollectionState } from '@uploadcare/react-uploader';
// --- NEW --- Import our new Reactions component
import Reactions from './Reactions';


interface PostCardProps {
    post: LocalPost;
    userProfile: LocalUserProfile | null;
    onUpdate: (postId: number, newContent: string, newFiles: OutputFileEntry[], deletedImageIds: number[]) => void;
    onDelete: (postId: number) => void;
    onReport: (postId: number) => void;
    onBlockUser: (userId: string) => void;
    onSavePost: (postId: number, isCurrentlySaved: boolean) => void;
}

interface UserPostProps {
    post: LocalPost;
    userProfile: LocalUserProfile | null;
    onUpdate: (postId: number, newContent: string, newFiles: OutputFileEntry[], deletedImageIds: number[]) => void;
    onDelete: (postId: number) => void;
    onReport: (postId: number) => void;
    onBlockUser: (userId: string) => void;
    onSavePost: (postId: number, isCurrentlySaved: boolean) => void;
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

const UserPost = ({ post, userProfile, onUpdate, onDelete, onReport, onBlockUser, onSavePost }: UserPostProps) => {
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [showBlockConfirm, setShowBlockConfirm] = useState(false);
    const [editedContent, setEditedContent] = useState(post.post_content);
    const menuRef = useRef<HTMLDivElement>(null);
    const defaultAvatar = '/default-avatar.jpg';
    const [newlyUploadedFiles, setNewlyUploadedFiles] = useState<OutputFileEntry[]>([]);
    const [imagesToDelete, setImagesToDelete] = useState<number[]>([]);
    const savedPostRecord: LocalSavedPost | undefined = useLiveQuery(() => userProfile ? db.social_saved_posts.where({ user_id: userProfile.user_id, post_id: post.id }).first() : undefined, [userProfile, post.id]);
    const isSaved = !!savedPostRecord;
    const postImages: LocalPostImage[] | undefined = useLiveQuery(() => db.social_post_images.where({ post_id: post.id }).toArray(), [post.id]);
    const { ref, inView } = useInView({ threshold: 0.5, triggerOnce: true });
    useEffect(() => { if (inView) { trackEvent('post_viewed', { post_id: post.id, author_id: post.author_id }); } }, [inView, post.id, post.author_id]);
    const authorProfile: LocalUserProfile | undefined = useLiveQuery(() => db.userProfile.where('user_id').equals(post.author_id).first(), [post.author_id]);
    useEffect(() => { const handleClickOutside = (event: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(event.target as Node)) { setIsMenuOpen(false); } }; document.addEventListener("mousedown", handleClickOutside); return () => document.removeEventListener("mousedown", handleClickOutside); }, []);
    const handleUploadChange = (data: OutputCollectionState) => { setNewlyUploadedFiles(data.allEntries.filter(file => file.status === 'success')); };
    const handleMarkImageForDeletion = (imageId: number) => { setImagesToDelete(prev => [...prev, imageId]); };
    const handleUpdateSubmit = () => { const hasTextChanged = editedContent.trim() !== post.post_content; const haveImagesChanged = newlyUploadedFiles.length > 0 || imagesToDelete.length > 0; if (hasTextChanged || haveImagesChanged) { onUpdate(post.id, editedContent, newlyUploadedFiles, imagesToDelete); } setIsEditing(false); setNewlyUploadedFiles([]); setImagesToDelete([]); };
    if (!authorProfile) { return <div className='post-block p-4'>Loading user profile...</div>; }
    const isOwner = userProfile?.user_id === post.author_id;
    const isStampBot = post.author_id === '05492a51-479c-4372-a4f1-4e6f250471d4';
    const formattedDate = formatRelativeTime(new Date(post.created_at));
    const parsedContent = parseBBCode(isEditing ? editedContent : post.post_content);
    const avatarSource = authorProfile.profileImage || defaultAvatar;
    const isOTD = post.post_type === 'OTD';

    return (
        <div ref={ref}>
            <div className='post-heading'>
                <Image className='avatar' src={avatarSource} alt="Avatar" width={50} height={50} />
                <div className='user-info'>
                    {isOTD ? (<div className='username-container'><div className='username'>{authorProfile.displayName}</div><div><BiCaretRight size={20} className='context-menu-icon ml-[6px]'/>On this day...</div></div>) : (<span className='username'>{authorProfile.displayName}</span>)}
                    <span className='post-date'>{formattedDate}</span>
                </div>
                <div className="comment-options" ref={menuRef}>
                    <SlOptions size={32} className="options-icon" onClick={() => setIsMenuOpen(!isMenuOpen)} />
                    {isMenuOpen && (<div className="context-menu">{isOwner ? (<><div onClick={() => { setIsEditing(true); setIsMenuOpen(false); }}><SlPencil size={16} className='context-menu-icon'/>Edit Post</div><div onClick={() => { onDelete(post.id); setIsMenuOpen(false); }}><SlTrash size={16} className='context-menu-icon'/>Delete Post</div></>) : (<><div onClick={() => { onSavePost(post.id, isSaved); setIsMenuOpen(false); }}><SlPaperClip size={16} className='context-menu-icon'/>{isSaved ? 'Unsave Post' : 'Save Post'}</div><div onClick={() => { onReport(post.id); setIsMenuOpen(false); }}><SlShield size={16} className='context-menu-icon'/>Report Post</div>{!isStampBot && (<div onClick={() => { setShowBlockConfirm(true); setIsMenuOpen(false); }}><SlBan size={16} className='context-menu-icon'/>Block {authorProfile.displayName}</div>)}</>)}</div>)}
                </div>
            </div>
            {(isOwner && (post.post_status !== 'approved')) && (<div className="post-status-container mb-[8px]"><span className={`status-badge ${post.post_status}`}>{post.post_status === 'pending' && 'Pending Moderation'}{post.post_status === 'flagged' && (<>Moderation Failed <a href="#" className="appeal-link" onClick={(e) => e.preventDefault()}> (Appeal)</a></>)}{post.post_status === 'appealed' && 'Pending Appeal'}{post.post_status === 'reported' && 'Post Reported'}</span></div>)}
            {isEditing ? (
                <div className="edit-post-container">
                    <textarea value={editedContent} onChange={(e) => setEditedContent(e.target.value)} className="edit-textarea" rows={5} />
                    <p className="edit-section-header">Manage Images</p>
                    <div className="image-preview-container edit-mode">
                        {postImages?.filter(img => !imagesToDelete.includes(img.id)).map(image => (<div key={image.id} className="thumbnail"><Image src={`${image.image_url}-/preview/100x100/`} alt="Existing image" width={60} height={60} className="thumbnail-image" /><button onClick={() => handleMarkImageForDeletion(image.id)} className="remove-button">×</button></div>))}
                        {newlyUploadedFiles.map((file, index) => (<div key={file.uuid || index} className="thumbnail">{file.cdnUrl && <Image src={`${file.cdnUrl}-/preview/100x100/`} alt="New image" width={60} height={60} className="thumbnail-image" />}</div>))}
                    </div>
                    <div className='uploader-regular-container mt-2'><FileUploaderRegular pubkey={process.env.NEXT_PUBLIC_UPLOADCARE_PUBLIC_KEY || ''} multiple imgOnly sourceList='local, url, camera, gdrive' onChange={handleUploadChange} classNameUploader="uc-light" /></div>
                    <div className="edit-actions"><button onClick={() => { setIsEditing(false); setEditedContent(post.post_content); setNewlyUploadedFiles([]); setImagesToDelete([]); }}>Cancel</button><button onClick={handleUpdateSubmit}>Save</button></div>
                </div>
            ) : (<div className='post-content' dangerouslySetInnerHTML={{ __html: parsedContent }} />)}
            {!isEditing && post.id > 0 && <PostImages postId={post.id} />}
            <div className="post-info">
                <div className="post-info-reactions"><p>{pluralize(post.totalreactions || 0, 'reaction')}</p></div>
                <div className="post-info-stats"><p>{pluralize(post.totalcomments || 0, 'comment')} • {pluralize(post.totalshares || 0, 'share')}</p></div>
            </div>
            <div className="post-footer">
                {/* --- UPDATED --- The static "Like" button is replaced with our interactive component */}
                <Reactions entityId={post.id} entityType="post" userProfile={userProfile} displayStyle="button" />
                <div className='footer-action'><SlBubble className='post-icon' size={16} />Comment</div>
                <div className='footer-action'><SlShareAlt className='post-icon' size={16} />Share</div>
            </div>
            {post.id && (post.allow_comments !== false) && (<Suspense fallback={<div className="p-4">Loading comments...</div>}><CommentsSection postId={post.id} /></Suspense>)}
            {showBlockConfirm && (<div className="modal"><div className="modal-content"><div className='flex flex-row'><SlExclamation className='text-red-700 mr-[8px]' style={{ color: 'red' }} size={24} /><h3>Are you sure you want to block {authorProfile.displayName}?</h3></div><p>You will no longer see their posts or comments.</p><div className="modal-actions flex justify-end"><button onClick={() => setShowBlockConfirm(false)} className="close-button">Cancel</button><button onClick={() => { onBlockUser(post.author_id); setShowBlockConfirm(false); }} className="submit-button">Block</button></div></div></div>)}
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

export default function PostCard({ post, userProfile, onUpdate, onDelete, onReport, onBlockUser, onSavePost }: PostCardProps) {
    const renderContent = () => {
        switch (post.post_type) {
            case 'Ad':
            case 'Sponsored':
                return <AdPost post={post} />;
            case 'Suggestion':
                return <div className="p-4">Suggestion Card Placeholder</div>;
            case 'User':
            default:
                return <UserPost 
                    post={post} 
                    userProfile={userProfile} 
                    onUpdate={onUpdate}
                    onDelete={onDelete}
                    onReport={onReport}
                    onBlockUser={onBlockUser}
                    onSavePost={onSavePost}
                />;
        }
    };
    return (
        <div className='post-block'>
            {renderContent()}
        </div>
    );
}