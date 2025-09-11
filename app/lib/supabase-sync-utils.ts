// app/lib/supabase-sync-utils.ts

import { createBrowserClient } from '@supabase/ssr';
import { db } from './local-db';
import { LocalPost } from './local-db'; // Make sure this is the correct import

const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

/**
 * Creates a new post locally and prepares it for remote synchronization.
 */
export async function createLocalPost(newPostData: Partial<LocalPost>) {
    try {
        const tempId = Date.now();
        const localPost = {
            id: tempId,
            ...newPostData,
            is_synced: false,
            created_at: new Date().toISOString(),
            post_type: 'User',
            post_status: 'pending',
        } as LocalPost;

        await db.social_posts.add(localPost);
        console.log('Post saved to local DB:', localPost);
        await syncNewPosts();

        return localPost;
    } catch (error) {
        console.error('Failed to save post to local DB:', error);
        throw error;
    }
}

/**
 * Synchronizes new posts from the local database to the remote Supabase database.
 */
export async function syncNewPosts() {
    try {
        const unsyncedPosts = await db.social_posts.filter(post => !post.is_synced).toArray();
        console.log(`Found ${unsyncedPosts.length} unsynced posts to sync.`);

        if (unsyncedPosts.length > 0) {
            for (const post of unsyncedPosts) {
                // Prepare the object to be sent to Supabase with only the required columns
                const postToSync = {
                    author_id: post.author_id,
                    post_content: post.post_content,
                    created_at: post.created_at,
                    post_type: post.post_type,
                    post_status: post.post_status,
                    post_visibility: 1
                };

                const tempId = post.id;

                const { data, error } = await supabase
                    .from('social_posts') // Ensure we are inserting into the 'social_posts' table
                    .insert(postToSync)
                    .select();

                if (error) {
                    console.error('Error syncing post to Supabase:', error);
                } else if (data && data.length > 0) {
                    const syncedPost = data[0];
                    await db.social_posts.update(tempId, {
                        id: syncedPost.id,
                        is_synced: true,
                        created_at: syncedPost.created_at,
                    });
                    console.log('Post successfully synced and updated with real ID:', syncedPost.id);
                }
            }
        }
    } catch (error) {
        console.error('Error during post synchronization:', error);
    }
}