// app/components/FeedContainer.tsx
'use client';

import { useEffect, useState, useCallback } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import Feed from './Feed';
import AddPostButton from './AddPostButton';
import { db, LocalPost, LocalComment, LocalProfile } from '@/app/lib/local-db';
import { useUser } from '@/app/context/user-context';
import { Post } from '@/app/lib/types';

export default function FeedContainer() {
    const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    const { userProfile, loading: userLoading } = useUser();
    const [loading, setLoading] = useState(true);
    const [posts, setPosts] = useState<LocalPost[]>([]);
    const [offset, setOffset] = useState(0);
    const [hasMore, setHasMore] = useState(true);
    const [isFetchingMore, setIsFetchingMore] = useState(false);

    const handleLoadMore = useCallback(() => {
        if (!hasMore || isFetchingMore) return;
        setIsFetchingMore(true);
        setOffset(prevOffset => prevOffset + 50);
    }, [hasMore, isFetchingMore]);

    useEffect(() => {
        const fetchAndSyncPosts = async () => {
            if (userLoading) {
                return;
            }
            try {
                if (!userProfile?.user_id) {
                    setLoading(false);
                    return;
                }
                
                // Fetch a new batch of posts from Supabase
                const { data: postsData, error: postsError } = await supabase
                    .from('social_posts')
                    .select(`
                        id,
                        created_at,
                        author_id,
                        post_content,
                        totalcomments,
                        totalreactions,
                        totalshares
                    `)
                    .order('created_at', { ascending: false })
                    .limit(50)
                    .range(offset, offset + 49);

                if (postsError) {
                    console.error('Error fetching posts:', postsError);
                    setLoading(false);
                    return;
                }
                
                if (postsData && postsData.length > 0) {
                    const postIds = postsData.map(post => post.id);
                    const authorIds = postsData.map(post => post.author_id);

                    // Fetch profiles and comments in parallel
                    const [commentsResult, profilesResult] = await Promise.all([
                      supabase.from('social_post_comments').select('*').in('post_id', postIds),
                      supabase.from('user_profile').select('user_id, displayName, profileImage, username').in('user_id', authorIds)
                    ]);

                    // Sync all data to the local database
                    if (commentsResult.data) {
                        await db.social_post_comments.bulkPut(commentsResult.data as LocalComment[]);
                    }

                    if (profilesResult.data) {
                        await db.userProfile.bulkPut(profilesResult.data as LocalProfile[]);
                    }
                    
                    if (postsData) {
                        await db.social_posts.bulkPut(postsData as LocalPost[]);
                    }
                    
                    // Filter out any posts that already exist in the state to prevent key errors
                    const existingPostIds = new Set(posts.map(post => post.id));
                    const uniqueNewPosts = postsData.filter(post => !existingPostIds.has(post.id));

                    setPosts(prevPosts => [...prevPosts, ...uniqueNewPosts as LocalPost[]]);

                    if (postsData.length < 50) {
                        setHasMore(false);
                    }
                } else {
                    setHasMore(false);
                }
            } catch (err) {
                console.error('Error during posts sync:', err);
            } finally {
                setLoading(false);
                setIsFetchingMore(false);
            }
        };

        fetchAndSyncPosts();
    }, [userProfile, userLoading, offset]);


    if (loading || userLoading) {
        return <div className="feed-container">Loading...</div>;
    }

    return (
        <>
            <AddPostButton />
            <Feed posts={posts} onLoadMore={handleLoadMore} hasMore={hasMore} isFetchingMore={isFetchingMore} />
        </>
    );
}