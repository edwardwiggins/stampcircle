// app/lib/supabase.ts
import { createBrowserClient } from '@supabase/ssr';
import { Post } from './types';

export const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function createPost(content: string) {
    const response = await fetch('/api/create-post', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ content }),
    });

    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create post');
    }

    return await response.json();
}

export async function getPosts(limit: number = 25, offset: number = 0) {
    const { data, error } = await supabase
        .from('consolidated_social_posts')
        .select('*')
        .order('created_at', { ascending: false })
        .eq('post_status', 'approved')
        .range(offset, offset + limit - 1);

    if (error) {
        console.error('Error fetching initial posts:', error);
        return [];
    }
    return data;
}

export async function getMorePosts(offset: number, limit: number = 10) {
    const { data, error } = await supabase
        .from('consolidated_social_posts')
        .select('*')
        .order('created_at', { ascending: false })
        .eq('post_status', 'Approved')
        .range(offset, offset + limit - 1);

    if (error) {
        throw error;
    }
    return data;
}