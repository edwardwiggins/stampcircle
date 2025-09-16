import { createBrowserClient } from '@supabase/ssr';
import { db } from './local-db';
import { LocalPost, LocalComment } from './local-db';

const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

let isSyncingPosts = false;
let isSyncingComments = false;

export async function createLocalPost(newPostData: Partial<LocalPost>) {
    try {
        const tempId = -Date.now();
        const localPost: LocalPost = {
            id: tempId,
            created_at: new Date().toISOString(),
            author_id: newPostData.author_id!,
            post_content: newPostData.post_content!,
            synced: 0,
            post_type: 'User',
            post_status: 'pending',
            post_visibility: newPostData.post_visibility,
            allow_comments: newPostData.allow_comments ?? true,
            totalreactions: 0,
            totalcomments: 0,
            totalshares: 0,
        };
        await db.social_posts.add(localPost);
        return localPost;
    } catch (error) {
        console.error('Failed to save post to local DB:', error);
        throw error;
    }
}

export async function syncLocalPosts() {
    if (isSyncingPosts) return;
    if (!navigator.onLine) return;

    try {
        isSyncingPosts = true;
        
        const unsyncedPosts = await db.social_posts.where({ synced: 0 }).toArray();
        if (unsyncedPosts.length === 0) {
            isSyncingPosts = false;
            return;
        }

        for (const post of unsyncedPosts) {
            try {
                if (post.is_deleted) {
                    const { error } = await supabase.rpc('delete_post', { post_id_to_delete: post.id });
                    if (error) throw error;
                    await db.social_posts.delete(post.id);
                    continue; 
                }

                const { isFlagged, embedding, moderationData } = await fetch('/api/moderate', { 
                    method: 'POST', 
                    headers: { 'Content-Type': 'application/json' }, 
                    body: JSON.stringify({ content: post.post_content, type: 'post' }) 
                }).then(res => res.json());

                const newStatus = isFlagged ? 'flagged' : 'approved';
                
                if (post.id < 0) {
                    const tempId = post.id;
                    const postToInsert = {
                        author_id: post.author_id,
                        post_content: post.post_content,
                        created_at: post.created_at,
                        post_type: 'User' as const,
                        post_status: newStatus,
                        post_visibility: post.post_visibility,
                        allow_comments: post.allow_comments,
                        post_embedding: embedding,
                        moderation_data: moderationData,
                    };
                    const { data, error } = await supabase.from('social_posts').insert(postToInsert).select().single();
                    if (error) throw error;
                    if (data) {
                        await db.social_posts.delete(tempId);
                        const finalPost: LocalPost = { ...data, synced: 1 };
                        await db.social_posts.put(finalPost);
                    }
                } else {
                    const postToUpdate = {
                        post_content: post.post_content,
                        post_status: newStatus,
                        post_visibility: post.post_visibility,
                        allow_comments: post.allow_comments,
                        post_embedding: embedding,
                        moderation_data: moderationData,
                    };
                    const { data, error } = await supabase.from('social_posts').update(postToUpdate).eq('id', post.id).select().single();
                    if (error) throw error;
                    if (data) {
                        await db.social_posts.update(post.id, { ...data, synced: 1 });
                    }
                }
            } catch (syncError) {
                console.error(`Failed to sync post with id ${post.id}:`, JSON.stringify(syncError, null, 2));
            }
        }
    } catch (error) {
        console.error('Error during post synchronization process:', error);
    } finally {
        isSyncingPosts = false;
    }
}

export async function syncLocalComments() {
    if (isSyncingComments) return;
    if (!navigator.onLine) return;

    try {
        isSyncingComments = true;
        
        const unsyncedComments = await db.social_post_comments.where({ synced: 0 }).toArray();
        if (unsyncedComments.length === 0) {
            isSyncingComments = false;
            return;
        }

        for (const comment of unsyncedComments) {
            try {
                if (comment.is_deleted) {
                    const { error } = await supabase.rpc('delete_comment', { comment_id_to_delete: comment.id });
                    if (!error) await db.social_post_comments.update(comment.id, { synced: 1 });
                } else if (comment.id < 0) {
                    const tempId = comment.id;
                    const { isFlagged, moderationData } = await fetch('/api/moderate', { 
                        method: 'POST', 
                        headers: { 'Content-Type': 'application/json' }, 
                        body: JSON.stringify({ content: comment.comment_content, type: 'comment' }) 
                    }).then(res => res.json());

                    const newStatus = isFlagged ? 'flagged' : 'approved';
                    
                    const { data: newCommentData, error: commentError } = await supabase.from('social_post_comments')
                        .insert({ 
                            post_id: comment.post_id, 
                            author_id: comment.author_id, 
                            comment_content: comment.comment_content, 
                            parent_comment_id: comment.parent_comment_id, 
                            depth: comment.depth, 
                            status: newStatus, 
                            moderation_data: moderationData 
                        }).select().single();

                    if (commentError) throw commentError;

                    if (newCommentData && comment.images && comment.images.length > 0) {
                        const imagesToInsert = comment.images.map(file => ({
                            comment_id: newCommentData.id,
                            user_id: newCommentData.author_id,
                            image_url: file.cdnUrl
                        }));

                        // **UPDATED**: Add .select() to get the inserted image data back
                        const { data: newImageData, error: imageError } = await supabase.from('social_comment_images').insert(imagesToInsert).select();
                        if (imageError) throw imageError;
                        
                        // **THE FIX**: If the images were inserted successfully, add them to the local DB.
                        if (newImageData) {
                            await db.social_comment_images.bulkPut(newImageData);
                        }
                    }

                    if (newCommentData) {
                        await db.social_post_comments.delete(tempId);
                        const { images, ...restOfComment } = comment;
                        await db.social_post_comments.put({ ...restOfComment, ...newCommentData, created_at: new Date(newCommentData.created_at), synced: 1 });
                    }
                } else { // EDITED comment
                    const { data: { user } } = await supabase.auth.getUser();
                    if (comment.author_id !== user?.id) {
                        console.error(`RLS PRE-CHECK FAILED: Current user (${user?.id}) is not the author (${comment.author_id}) of comment ${comment.id}. Skipping sync for this item.`);
                        continue;
                    }

                    const { isFlagged, moderationData } = await fetch('/api/moderate', { 
                        method: 'POST', 
                        headers: { 'Content-Type': 'application/json' }, 
                        body: JSON.stringify({ content: comment.comment_content, type: 'comment' }) 
                    }).then(res => res.json());
                    
                    const newStatus = isFlagged ? 'flagged' : 'approved';
                    const { data, error } = await supabase.from('social_post_comments').update({ comment_content: comment.comment_content, status: newStatus, moderation_data: moderationData }).eq('id', comment.id).select().single();
                    if (error) throw error;
                    if (data) await db.social_post_comments.update(comment.id, { ...data, created_at: new Date(data.created_at), synced: 1 });
                }
            } catch (syncError) {
                console.error(`Failed to sync comment with id ${comment.id}:`, JSON.stringify(syncError, null, 2));
            }
        }
    } catch (error) {
        console.error('Error during comment synchronization process:', error);
    } finally {
        isSyncingComments = false;
    }
}