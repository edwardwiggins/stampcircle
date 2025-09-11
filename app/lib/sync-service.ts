// app/lib/sync-service.ts
import { db } from './local-db';
import { createBrowserClient } from '@supabase/ssr';

const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function syncPostsAndComments(userId: string) {
    console.log('Starting sync...');
    try {
        // --- 1. Fetch posts from Supabase for the current user ---
        const { data: posts, error: postsError } = await supabase
            .from('social_posts')
            .select(`...`)
            .eq('author_id', userId) // Add this filter
            .order('created_at', { ascending: false })
            .limit(50);

        if (postsError) throw postsError;
        if (!posts) throw new Error("No posts returned from Supabase.");

        // --- 2. Fetch comments from Supabase for the current user's posts ---
        const postIds = posts.map(post => post.id);
        const { data: comments, error: commentsError } = await supabase
            .from('social_post_comments')
            .select(`...`)
            .in('post_id', postIds) // Add this filter
            .order('created_at', { ascending: false })
            .limit(100);

        if (commentsError) throw commentsError;
        if (!comments) throw new Error("No comments returned from Supabase.");

        // --- 3. Fetch user profiles ---
        const postAuthorIds = posts.map(post => post.author_id);
        const commentAuthorIds = comments.map(comment => comment.author_id);
        const allAuthorIds = [...new Set([...postAuthorIds, ...commentAuthorIds])];

        const { data: userProfiles, error: userProfilesError } = await supabase
            .from('user_profile')
            .select(`...`)
            .in('user_id', allAuthorIds);

        if (userProfilesError) throw userProfilesError;
        if (!userProfiles) throw new Error("No user profiles returned from Supabase.");

        // --- 4. Save all fetched data to Dexie ---
        await db.userProfile.bulkPut(userProfiles.map(profile => ({ ...profile, is_synced: true })));
        await db.social_posts.bulkPut(posts.map(post => ({ ...post, is_synced: true })));
        await db.social_post_comments.bulkPut(comments.map(comment => ({ ...comment, is_synced: true })));

        console.log(`Synced ${posts.length} posts, ${comments.length} comments, and ${userProfiles.length} user profiles to local DB.`);

    } catch (error) {
        console.error('Error during sync:', error);
    }
}