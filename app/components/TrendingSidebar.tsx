// app/components/TrendingSidebar.tsx
'use client';

import { useQuery } from '@tanstack/react-query';
import { useUser } from '@/app/context/user-context';
import { LocalPost } from '@/app/lib/local-db';
import Link from 'next/link';

const TrendingSidebar = () => {
    // --- UPDATED --- Get the global offline status
    const { supabase, isOffline } = useUser();

    const { data: trendingPosts, isLoading, isError } = useQuery({
        queryKey: ['trending-posts-cache'],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('trending_posts_cache')
                .select('*')
                .order('rank', { ascending: true });

            if (error) throw new Error(error.message);
            return data as LocalPost[];
        },
        refetchInterval: 600000, 
        // --- UPDATED --- Only enable the query when online
        enabled: !!supabase && !isOffline,
    });

    return (
        <div className="bg-gray-50 p-4 rounded-lg border-gray-200">
            <div className='headings'>
                <h1>Trending Now</h1>
            </div>
            {/* --- UPDATED --- Show a specific message when offline */}
            {isOffline ? (
                <p className="text-sm text-gray-500">Trending is unavailable while offline.</p>
            ) : isLoading ? (
                <p className="text-sm text-gray-500">Loading...</p>
            ) : isError ? (
                <p className="text-sm text-red-500">Could not load trending posts.</p>
            ) : (
                <ul className="space-y-3">
                    {trendingPosts?.map(post => (
                        <li key={post.id}>
                            <Link href={`/post/${post.id}`} className="hover:text-blue-500">
                                <p className="font-semibold text-sm truncate">{post.post_content || 'View Post'}</p>
                                <p className="text-xs text-gray-400">View Post &rarr;</p>
                            </Link>
                        </li>
                    ))}
                    {trendingPosts?.length === 0 && <p className="text-sm text-gray-500">Nothing is trending right now.</p>}
                </ul>
            )}
        </div>
    );
};

export default TrendingSidebar;