// app/lib/server-supabase.ts
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { CookieStore } from '@supabase/ssr';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Supabase URL and anon key are required.');
}

export const createServerSupabaseClient = () => {
    const cookieStore = cookies();
    return createServerClient(supabaseUrl, supabaseAnonKey, {
        cookies: {
            getAll: () => cookieStore.getAll(),
            setAll: (cookiesToSet) => {
                cookiesToSet.forEach(({ name, value, options }) =>
                    cookieStore.set(name, value, options)
                );
            },
        },
    });
};

export async function getPosts(limit: number = 50, offset: number = 0) {
    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase
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
        .eq('post_status', 'approved')
        .range(offset, offset + limit - 1);

    if (error) {
        console.error('Error fetching posts:', error);
        return [];
    }
    return data;
}