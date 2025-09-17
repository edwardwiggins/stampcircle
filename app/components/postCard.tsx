'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import Image from 'next/image';
import { formatRelativeTime, pluralize } from '@/app/lib/utils';
import { parseBBCode } from '@/app/lib/bbcode-parser';
import { db, LocalPost, LocalUserProfile } from '@/app/lib/local-db';
import { SlLike, SlBubble, SlShareAlt, SlLink, SlOptions, SlPencil, SlTrash, SlShield, SlPaperClip, SlExclamation, SlBan } from "react-icons/sl"; 
import CommentsSection from './CommentsSection';
import { useLiveQuery } from 'dexie-react-hooks';
import { useInView } from 'react-intersection-observer';
import { trackEvent } from '@/app/lib/analytics';

interface PostCardProps {
    post: LocalPost;
    userProfile: LocalUserProfile | null;
    onUpdate: (postId: number, newContent: string) => void;
    onDelete: (postId: number) => void;
    onReport: (postId: number) => void;
    onBlockUser: (userId: string) => void;
}

interface UserPostProps {
    post: LocalPost;
    userProfile: LocalUserProfile | null;
    onUpdate: (postId: number, newContent: string) => void;
    onDelete: (postId: number) => void;
    onReport: (postId: number) => void;
    onBlockUser: (userId: string) => void;
}

// --- Helper Component for Standard User Posts ---
const UserPost = ({ post, userProfile, onUpdate, onDelete, onReport, onBlockUser }: UserPostProps) => {
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [showBlockConfirm, setShowBlockConfirm] = useState(false);
    const [editedContent, setEditedContent] = useState(post.post_content);
    const menuRef = useRef<HTMLDivElement>(null);
    const defaultAvatar = '/default-avatar.jpg';

    const { ref, inView } = useInView({
        threshold: 0.5,
        triggerOnce: true,
    });

    useEffect(() => {
        if (inView) {
            trackEvent('post_viewed', { 
                post_id: post.id,
                author_id: post.author_id
            });
        }
    }, [inView, post.id, post.author_id]);

    const authorProfile: LocalUserProfile | undefined = useLiveQuery(
        () => db.userProfile.where('user_id').equals(post.author_id).first(),
        [post.author_id]
    );
    
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
          if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
            setIsMenuOpen(false);
          }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const handleUpdateSubmit = () => {
        if (editedContent.trim() && editedContent !== post.post_content) {
          onUpdate(post.id, editedContent);
        }
        setIsEditing(false);
    };

    if (!authorProfile) {
        return <div className='post-block p-4'>Loading user profile...</div>;
    }

    const isOwner = userProfile?.user_id === post.author_id;
    const formattedDate = formatRelativeTime(new Date(post.created_at));
    const parsedContent = parseBBCode(isEditing ? editedContent : post.post_content);
    const avatarSource = authorProfile.profileImage || defaultAvatar;

    return (
        <div ref={ref}>
            <div className='post-heading'>
                <Image
                    className='avatar'
                    src={avatarSource}
                    alt="Avatar"
                    width={50}
                    height={50}
                />
                <div className='user-info'>
                    <span className='username'>{authorProfile.displayName}</span>
                    <span className='post-date'>{formattedDate}</span>
                </div>
                
                <div className="comment-options" ref={menuRef}>
                    <SlOptions 
                        size={32} 
                        className="options-icon" 
                        onClick={() => setIsMenuOpen(!isMenuOpen)} 
                    />
                    {isMenuOpen && (
                        <div className="context-menu">
                        {isOwner ? (
                            <>
                                <div onClick={() => { setIsEditing(true); setIsMenuOpen(false); }}>
                                    <SlPencil size={16} className='context-menu-icon'/>Edit Post
                                </div>
                                <div onClick={() => { onDelete(post.id); setIsMenuOpen(false); }}>
                                    <SlTrash size={16} className='context-menu-icon'/>Delete Post
                                </div>
                            </>
                        ) : (
                            <>
                                <div onClick={() => { setIsMenuOpen(false); }}>
                                    <SlPaperClip size={16} className='context-menu-icon'/>Save Post
                                </div>
                                <div onClick={() => { onReport(post.id); setIsMenuOpen(false); }}>
                                    <SlShield size={16} className='context-menu-icon'/>Report Post
                                </div>
                                <div onClick={() => { setShowBlockConfirm(true); setIsMenuOpen(false); }}>
                                    <SlBan size={16} className='context-menu-icon'/>Block {authorProfile.displayName}
                                </div>
                            </>
                        )}
                        </div>
                    )}
                </div>
            </div>

            {(post.post_status === 'pending' || post.post_status === 'flagged' || post.post_status === 'reported') && (
                <div className="post-status-container">
                    <span className={`status-badge ${post.post_status}`}>
                        {post.post_status === 'pending' && 'Pending Moderation'}
                        {post.post_status === 'flagged' && 'Moderation Failed'}
                        {post.post_status === 'reported' && 'Post Reported'}
                    </span>
                </div>
            )}

            {isEditing ? (
                <div className="edit-post-container">
                    <textarea
                        value={editedContent}
                        onChange={(e) => setEditedContent(e.target.value)}
                        className="edit-textarea"
                        rows={5}
                    />
                    <div className="edit-actions">
                        <button onClick={() => { setIsEditing(false); setEditedContent(post.post_content); }}>Cancel</button>
                        <button onClick={handleUpdateSubmit}>Save</button>
                    </div>
                </div>
            ) : (
                <div className='post-content' dangerouslySetInnerHTML={{ __html: parsedContent }} />
            )}

            <div className="post-info">
                <div className="post-info-reactions">
                    <p>{pluralize(post.totalreactions || 0, 'reaction')}</p>
                </div>
                <div className="post-info-stats">
                    <p>{pluralize(post.totalcomments || 0, 'comment')} • {pluralize(post.totalshares || 0, 'share')}</p> 
                </div>
            </div>
            <div className="post-footer">
                <div className='footer-action'><SlLike className='post-icon' size={16} />Like</div>
                <div className='footer-action'><SlBubble className='post-icon' size={16} />Comment</div>
                <div className='footer-action'><SlShareAlt className='post-icon' size={16} />Share</div>
            </div>
            {post.id && (post.allow_comments !== false) && (
                <Suspense fallback={<div className="p-4">Loading comments...</div>}>
                    <CommentsSection postId={post.id} />
                </Suspense>
            )}

            {showBlockConfirm && (
                <div className="modal">
                    <div className="modal-content">
                        <div className='flex flex-row'>
                            <SlExclamation className='text-red-700 mr-[8px]' style={{ color: 'red' }} size={24} />
                            <h3>Are you sure you want to block {authorProfile.displayName}?</h3>
                        </div>
                        <p>You will no longer see their posts or comments.</p>
                        <div className="modal-actions flex justify-end">
                            <button onClick={() => setShowBlockConfirm(false)} className="close-button">Cancel</button>
                            <button onClick={() => { onBlockUser(post.author_id); setShowBlockConfirm(false); }} className="submit-button">Block</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

// --- Helper Component for Ad/Sponsored Posts (Unchanged) ---
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
            {metadata.image_url && (
                <div className="ad-image-container my-2">
                     <Image
                        src={metadata.image_url}
                        alt={post.post_content || 'Advertisement'}
                        width={500}
                        height={300}
                        className="w-full h-auto object-cover rounded-md"
                     />
                </div>
            )}
            <div className='post-content'>
                <p>{post.post_content}</p>
                {metadata.price && <p className="font-bold text-lg my-2">{metadata.price}</p>}
            </div>
            <div className="post-footer">
                <a 
                    href={metadata.target_url} 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className='footer-action w-full justify-center text-blue-500 font-bold'
                >
                    <SlLink className='post-icon' size={16} /> Visit Site
                </a>
            </div>
        </>
    );
};

// --- Main PostCard Component (The "Router") ---
export default function PostCard({ post, userProfile, onUpdate, onDelete, onReport, onBlockUser }: PostCardProps) {
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
                />;
        }
    };

    return (
        <div className='post-block'>
            {renderContent()}
        </div>
    );
}