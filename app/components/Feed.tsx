'use client';

import PostCard from './postCard';
import type { LocalPost, LocalUserProfile } from '@/app/lib/local-db';

// **UPDATED**: The props interface now includes the onBlockUser handler.
interface FeedProps {
    posts: LocalPost[];
    userProfile: LocalUserProfile | null;
    onDeletePost: (postId: number) => void;
    onUpdatePost: (postId: number, newContent: string) => void;
    onReportPost: (postId: number) => void;
    onBlockUser: (userId: string) => void;
}

export default function Feed({ posts, userProfile, onDeletePost, onUpdatePost, onReportPost, onBlockUser }: FeedProps) {
    const uniquePosts = Array.from(new Map(posts.map(post => [post.id, post])).values());

    if (!uniquePosts || uniquePosts.length === 0) {
        return (
            <div className="feed-container">
                <p>No posts yet. Be the first to add one!</p>
            </div>
        );
    }
    
    return (
        <div className="feed-container">
            {uniquePosts.map((post) => (
                <PostCard 
                    key={post.id} 
                    post={post} 
                    userProfile={userProfile}
                    onDelete={onDeletePost}
                    onUpdate={onUpdatePost}
                    onReport={onReportPost}
                    onBlockUser={onBlockUser}
                />
            ))}
        </div>
    );
}