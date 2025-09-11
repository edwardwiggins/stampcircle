// app/components/Feed.tsx
'use client';

import { useUser } from '@/app/context/user-context';
import PostCard from './postCard';
import { LocalPost, LocalProfile } from '@/app/lib/local-db';

interface FeedProps {
    posts: LocalPost[];
    onLoadMore: () => void;
    hasMore: boolean;
    isFetchingMore: boolean;
}

export default function Feed({ posts, onLoadMore, hasMore, isFetchingMore }: FeedProps) {
    const { userProfile } = useUser();

    // De-duplicate the posts array before rendering
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
                <PostCard key={post.id} post={post} userProfile={userProfile} />
            ))}
            {hasMore && (
                <div className="text-center py-4">
                    <button
                        type="button"
                        onClick={onLoadMore}
                        className="bg-blue-500 text-white px-4 py-2 rounded-md"
                    >
                        {isFetchingMore ? 'Loading...' : 'Load More'}
                    </button>
                </div>
            )}
            {!hasMore && (
                <div className="text-center py-4 text-gray-500">
                    You've reached the end of the feed.
                </div>
            )}
        </div>
    );
}