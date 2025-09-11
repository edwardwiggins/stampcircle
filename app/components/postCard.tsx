import Image from 'next/image';
import { formatRelativeTime, pluralize } from '@/app/lib/utils';
import { parseBBCode } from '@/app/lib/bbcode-parser';
import { db, LocalPost, LocalUserProfile } from '@/app/lib/local-db';
import { SlLike, SlBubble, SlShareAlt } from "react-icons/sl";
import CommentsSection from './CommentsSection';
import { useLiveQuery } from 'dexie-react-hooks';
import { Suspense } from 'react';

export default function PostCard({ post }: { post: LocalPost }) {
    const defaultAvatar = '/default-avatar.jpg';

    // Use a live query to get the post's author profile from the local database
    const authorProfile: LocalUserProfile | undefined = useLiveQuery(
        () => db.userProfile.where('user_id').equals(post.author_id).first(),
        [post.author_id]
    );

    // Guard clause to handle cases where the author profile isn't synced yet
    if (!authorProfile) {
        return <div className='post-block'>Loading user profile...</div>;
    }

    const formattedDate = formatRelativeTime(post.created_at);
    const parsedContent = parseBBCode(post.post_content);
    const avatarSource = authorProfile.profileImage ? authorProfile.profileImage : defaultAvatar;
    
    return (
        <div className='post-block'>
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
            </div>
            <div className='post-content' dangerouslySetInnerHTML={{ __html: parsedContent }} />
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
            {/* Conditionally render CommentsSection only if post.id is valid */}
            {post.id && (
                <Suspense fallback={<div>Loading comments...</div>}>
                    <CommentsSection postId={post.id} />
                </Suspense>
            )}
        </div>
    );
}