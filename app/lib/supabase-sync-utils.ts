// lib/supabase-sync-utils.ts

import { db } from './local-db';
import { LocalPost, LocalComment, LocalPostImage, LocalCommentImage, LocalUserProfile, LocalNotification, LocalSocialTag, LocalUserConnection, LocalDirectMessage } from './local-db';
import type { OutputFileEntry } from '@uploadcare/react-uploader';
import supabase from '@/app/lib/client-supabase';

let isSyncingPosts = false;
let isSyncingComments = false;
let isSyncingReactions = false;
let isSyncingDirectMessages = false;

export async function syncUserSocialGraph(userId: string) {
  if (!supabase || !userId) return;

  try {
    const [connectionsResult, followsResult] = await Promise.all([
      supabase
        .from('social_user_connections')
        .select('*')
        .or(`user_id.eq.${userId},target_user_id.eq.${userId}`)
        .in('status', ['active', 'pending']),
      supabase
        .from('social_user_follows')
        .select('*')
        .eq('follower_id', userId)
    ]);

    if (connectionsResult.error) throw connectionsResult.error;
    if (followsResult.error) throw followsResult.error;
    
    const rawConnections = connectionsResult.data || [];
    const uniqueConnectionKeys = new Set<string>();
    const uniqueConnections: LocalUserConnection[] = [];

    for (const conn of rawConnections) {
      const key = [conn.user_id, conn.target_user_id].sort().join('-');
      if (!uniqueConnectionKeys.has(key)) {
        uniqueConnectionKeys.add(key);
        uniqueConnections.push(conn);
      }
    }

    const follows = followsResult.data || [];

    await db.transaction('rw', db.social_user_connections, db.social_user_follows, async () => {
      await db.social_user_connections.clear();
      await db.social_user_follows.clear();
      await db.social_user_connections.bulkPut(uniqueConnections);
      await db.social_user_follows.bulkPut(follows);
    });

  } catch (error) {
    console.error("Error syncing user's social graph:", error);
  }
}

export async function fetchPaginatedFeed(userId: string, page: number, pageSize: number = 10) {
  if (!supabase || !userId) return { posts: [], hasMore: false };

  try {
    const from = page * pageSize;
    const to = from + pageSize - 1;

    const { data: remotePosts, error: postsError } = await supabase
      .rpc('get_feed_for_user')
      .order('created_at', { ascending: false })
      .range(from, to);

    if (postsError) throw postsError;
    if (!remotePosts || remotePosts.length === 0) return { posts: [], hasMore: false };

    const hasMore = remotePosts.length === pageSize;
    const postIds = remotePosts.map((p: LocalPost) => p.id);

    const [
      postTagsResult,
      postImagesResult,
      commentsResult,
      savedPostsResult,
      postReactionsResult
    ] = await Promise.all([
      supabase.from('social_post_tags').select('*, social_tags(*)').in('post_id', postIds),
      supabase.from('social_post_images').select('*').in('post_id', postIds),
      supabase.from('social_post_comments').select('*, social_comment_images(*)').in('post_id', postIds).order('created_at', { ascending: true }),
      supabase.from('social_saved_posts').select('*').eq('user_id', userId).in('post_id', postIds),
      supabase.from('social_posts_reactions').select('*').in('post_id', postIds)
    ]);

    if (postTagsResult.error) throw postTagsResult.error;
    if (postImagesResult.error) throw postImagesResult.error;
    if (commentsResult.error) throw commentsResult.error;
    if (savedPostsResult.error) throw savedPostsResult.error;
    if (postReactionsResult.error) throw postReactionsResult.error;
    
    const rawPostTags = postTagsResult.data || [];
    const postTagsMap = new Map<string, any>();
    for (const pt of rawPostTags) {
      const key = `${pt.post_id}-${pt.tag_id}`;
      if (!postTagsMap.has(key)) {
        postTagsMap.set(key, pt);
      }
    }
    const remotePostTags = Array.from(postTagsMap.values());
    
    const remotePostImages = postImagesResult.data || [];
    const remoteComments = commentsResult.data || [];
    const remoteSavedPosts = savedPostsResult.data || [];
    const remotePostReactions = postReactionsResult.data || [];

    const commentIds = remoteComments.map((c: LocalComment) => c.id);
    const { data: remoteCommentReactions, error: commentReactionsError } = await supabase.from('social_comments_reactions').select('*').in('comment_id', commentIds);
    if (commentReactionsError) throw commentReactionsError;

    const authorIds = new Set<string>();
    remotePosts.forEach((p: LocalPost) => authorIds.add(p.author_id));
    remoteComments.forEach((c: LocalComment) => authorIds.add(c.author_id));

    const { data: profiles, error: profileError } = await supabase.from('user_profile').select('*').in('user_id', Array.from(authorIds));
    if (profileError) throw profileError;

    const tagsByPostId = new Map<number, LocalSocialTag[]>();
    remotePostTags.forEach((pt: any) => {
      if (!tagsByPostId.has(pt.post_id)) tagsByPostId.set(pt.post_id, []);
      if (pt.social_tags) tagsByPostId.get(pt.post_id)!.push(pt.social_tags);
    });

    const postsWithData = remotePosts.map((post: LocalPost) => ({
      ...post,
      synced: 1,
      tags: tagsByPostId.get(post.id) || [],
    }));
    
    await db.transaction('rw', db.tables, async () => {
      if (postsWithData.length > 0) await db.social_posts.bulkPut(postsWithData);
      if (remotePostImages.length > 0) await db.social_post_images.bulkPut(remotePostImages);
      if (profiles && profiles.length > 0) await db.userProfile.bulkPut(profiles);
      if (remoteSavedPosts.length > 0) await db.social_saved_posts.bulkPut(remoteSavedPosts);
      if (remotePostReactions.length > 0) await db.social_posts_reactions.bulkPut(remotePostReactions);
      if (remoteCommentReactions && remoteCommentReactions.length > 0) await db.social_comments_reactions.bulkPut(remoteCommentReactions);
      if (remotePostTags.length > 0) {
        const postTagsToStore = remotePostTags.map((pt: any) => ({ id: pt.id, post_id: pt.post_id, tag_id: pt.tag_id }));
        await db.social_post_tags.bulkPut(postTagsToStore);
      }
      
      if (remoteComments.length > 0) {
        const commentsToStore: LocalComment[] = [];
        const imagesToStore: LocalCommentImage[] = [];
        remoteComments.forEach((comment: any) => {
          const { social_comment_images, ...commentData } = comment;
          commentsToStore.push({ ...commentData, created_at: new Date(commentData.created_at), synced: 1 });
          if (social_comment_images) imagesToStore.push(...social_comment_images);
        });
        await db.social_post_comments.bulkPut(commentsToStore);
        await db.social_comment_images.bulkPut(imagesToStore);
      }
    });

    return { posts: postsWithData, hasMore };

  } catch (err) {
    console.error('Error fetching paginated feed:', err);
    return { posts: [], hasMore: false };
  }
}

const extractMentions = (content: string, pattern: RegExp): { display: string, id: string }[] => {
  const matches = [...content.matchAll(pattern)];
  return matches.map(match => ({ display: match[1], id: match[2] }));
};

const processPostTags = async (post: LocalPost) => {
  if (!post.post_content) return;

  const hashtagPattern = /#\[([^\]]+)\]\(([^)]+)\)/g;
  const allHashtags = extractMentions(post.post_content, hashtagPattern);

  const existingTagIds = new Set<number>();
  const suggestedTagNames = new Set<string>();

  for (const tag of allHashtags) {
    if (typeof tag.id === 'string' && tag.id.startsWith('SUGGEST_NEW:')) {
      suggestedTagNames.add(tag.id.split(':')[1]);
    } else if (!isNaN(Number(tag.id))) {
      existingTagIds.add(Number(tag.id));
    }
  }

  if (suggestedTagNames.size > 0) {
    const suggestionsToInsert = [...suggestedTagNames].map(tagName => ({
      tag_name: tagName,
      suggested_by_user_id: post.author_id,
      status: 'pending'
    }));
    const { error } = await supabase.from('social_suggested_tags').insert(suggestionsToInsert);
    if (error) console.error("Error saving suggested tags:", error);
  }
  
  await supabase.from('social_post_tags').delete().eq('post_id', post.id);

  if (existingTagIds.size > 0) {
    const tagsToInsert = [...existingTagIds].map(tagId => ({
      post_id: post.id,
      tag_id: tagId
    }));
    const { error } = await supabase.from('social_post_tags').insert(tagsToInsert);
    if (error) console.error("Error saving post tags:", error);
  }
};

export async function createLocalPost(newPostData: Partial<LocalPost>, uploadedFiles: OutputFileEntry[] = []) {
  try {
    const tempId = -Date.now();
    const localPost: LocalPost = {
      id: tempId,
      created_at: new Date().toISOString(),
      author_id: newPostData.author_id!,
      post_content: newPostData.post_content!,
      related_post_id: newPostData.related_post_id,
      synced: 0,
      post_type: 'User',
      post_status: 'pending',
      post_visibility: newPostData.post_visibility,
      allow_comments: newPostData.allow_comments ?? true,
      totalreactions: 0,
      totalcomments: 0,
      totalshares: 0,
      images: uploadedFiles,
    };
    await db.social_posts.add(localPost);
    return localPost;
  } catch (error) {
    console.error('Failed to save post to local DB:', error);
    throw error;
  }
}

export async function syncLocalPosts() {
  if (isSyncingPosts || !navigator.onLine) return;
  isSyncingPosts = true;

  try {
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

        let isFlagged = false;
        let embedding = null;
        let moderationData = null;
        const needsModeration = !post.related_post_id || (post.post_content && post.post_content.trim() !== '');

        if (needsModeration) {
          const moderationResult = await fetch('/api/moderate', { 
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' }, 
            body: JSON.stringify({ content: post.post_content, type: 'post' }) 
          }).then(res => res.json());

          isFlagged = moderationResult.isFlagged;
          embedding = moderationResult.embedding;
          moderationData = moderationResult.moderationData;
        }

        const newStatus = isFlagged ? 'flagged' : 'approved';
        
        if (post.id < 0) {
          const tempId = post.id;
          const postToInsert = {
            author_id: post.author_id,
            post_content: post.post_content,
            related_post_id: post.related_post_id,
            created_at: post.created_at,
            post_type: 'User' as const,
            post_status: newStatus,
            post_visibility: post.post_visibility,
            allow_comments: post.allow_comments,
            post_embedding: embedding,
            moderation_data: moderationData,
          };
          
          const { data: newPostData, error: postError } = await supabase.from('social_posts').insert(postToInsert).select().single();
          if (postError) throw postError;

          if (newPostData) {
            await processPostTags({ ...post, id: newPostData.id });
            
            if (post.images && post.images.length > 0) {
              const imagesToInsert = post.images.map(file => ({
                post_id: newPostData.id,
                user_id: newPostData.author_id,
                image_url: file.cdnUrl,
              }));
              const { data: newImageData, error: imageError } = await supabase.from('social_post_images').insert(imagesToInsert).select();
              if (imageError) throw imageError;
              if (newImageData) await db.social_post_images.bulkPut(newImageData);
            }

            await db.social_posts.delete(tempId);
            const { images, ...restOfPost } = post; 
            const finalPost: LocalPost = { ...restOfPost, ...newPostData, synced: 1 };
            await db.social_posts.put(finalPost);
          }
        } else {
          const { data: { user } } = await supabase.auth.getUser();
          if (post.author_id !== user?.id) {
            console.error(`RLS PRE-CHECK FAILED: Current user (${user?.id}) is not the author (${post.author_id}) of post ${post.id}. Skipping sync.`);
            continue;
          }
          await processPostTags(post);

          if (post.deletedImages && post.deletedImages.length > 0) {
            const { error: deleteError } = await supabase.from('social_post_images').delete().in('id', post.deletedImages);
            if (deleteError) throw deleteError;
            await db.social_post_images.bulkDelete(post.deletedImages);
          }

          if (post.newImages && post.newImages.length > 0) {
            const imagesToInsert = post.newImages.map(file => ({
              post_id: post.id,
              user_id: post.author_id,
              image_url: file.cdnUrl
            }));
            const { data: newImageData, error: imageError } = await supabase.from('social_post_images').insert(imagesToInsert).select();
            if (imageError) throw imageError;
            if (newImageData) await db.social_post_images.bulkPut(newImageData);
          }
          
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
            await db.social_posts.update(post.id, { 
              ...data, 
              synced: 1,
              newImages: [],
              deletedImages: []
            });
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
  if (isSyncingComments || !navigator.onLine) return;
  isSyncingComments = true;

  try {
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

          if (newCommentData) {
            if (comment.images && comment.images.length > 0) {
              const imagesToInsert = comment.images.map(file => ({
                comment_id: newCommentData.id,
                user_id: newCommentData.author_id,
                image_url: file.cdnUrl
              }));
              const { data: newImageData, error: imageError } = await supabase.from('social_comment_images').insert(imagesToInsert).select();
              if (imageError) throw imageError;
              if (newImageData) await db.social_comment_images.bulkPut(newImageData);
            }
            await db.social_post_comments.delete(tempId);
            const { images, ...restOfComment } = comment;
            await db.social_post_comments.put({ ...restOfComment, ...newCommentData, created_at: new Date(newCommentData.created_at), synced: 1 });
          }
        } else { 
          const { data: { user } } = await supabase.auth.getUser();
          if (comment.author_id !== user?.id) {
            console.error(`RLS PRE-CHECK FAILED: Current user (${user?.id}) is not the author (${comment.author_id}) of comment ${comment.id}. Skipping sync.`);
            continue;
          }
          if (comment.deletedImages && comment.deletedImages.length > 0) {
            const { error: deleteError } = await supabase.from('social_comment_images').delete().in('id', comment.deletedImages);
            if (deleteError) throw deleteError;
            await db.social_comment_images.bulkDelete(comment.deletedImages);
          }
          if (comment.newImages && comment.newImages.length > 0) {
            const imagesToInsert = comment.newImages.map(file => ({
              comment_id: comment.id,
              user_id: comment.author_id,
              image_url: file.cdnUrl
            }));
            const { data: newImageData, error: imageError } = await supabase.from('social_comment_images').insert(imagesToInsert).select();
            if (imageError) throw imageError;
            if (newImageData) await db.social_comment_images.bulkPut(newImageData);
          }

          const { isFlagged, moderationData } = await fetch('/api/moderate', { 
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' }, 
            body: JSON.stringify({ content: comment.comment_content, type: 'comment' }) 
          }).then(res => res.json());
          
          const newStatus = isFlagged ? 'flagged' : 'approved';
          const { data, error } = await supabase.from('social_post_comments')
            .update({ 
              comment_content: comment.comment_content, 
              status: newStatus, 
              moderation_data: moderationData 
            })
            .eq('id', comment.id)
            .select()
            .single();
            
          if (error) throw error;
          
          if (data) {
            await db.social_post_comments.update(comment.id, { 
              ...data, 
              created_at: new Date(data.created_at), 
              synced: 1, 
              newImages: [], 
              deletedImages: [] 
            });
          }
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

export async function syncLocalReactions() {
  if (isSyncingReactions || !navigator.onLine) return;
  isSyncingReactions = true;

  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const unsyncedPostReactions = await db.social_posts_reactions.where({ synced: 0, user_id: user.id }).toArray();
    for (const reaction of unsyncedPostReactions) {
      try {
        if (reaction.is_deleted) {
          await supabase.rpc('delete_post_reaction', { p_post_id: reaction.post_id });
          await db.social_posts_reactions.delete(reaction.id);
        } else {
          await supabase.rpc('delete_post_reaction', { p_post_id: reaction.post_id });
          const { data, error } = await supabase.rpc('add_post_reaction', { 
            p_post_id: reaction.post_id, 
            p_reaction_id: reaction.reaction_id 
          });
          if (error) throw error;
          
          const newId = data.id;
          await db.social_posts_reactions.delete(reaction.id);
          await db.social_posts_reactions.put({ ...reaction, id: newId, synced: 1, is_deleted: false });
        }
      } catch (syncError) {
        console.error(`Failed to sync post reaction for post ${reaction.post_id}:`, syncError);
      }
    }

    const unsyncedCommentReactions = await db.social_comments_reactions.where({ synced: 0, user_id: user.id }).toArray();
    for (const reaction of unsyncedCommentReactions) {
      try {
        if (reaction.is_deleted) {
          await supabase.rpc('delete_comment_reaction', { p_comment_id: reaction.comment_id });
          await db.social_comments_reactions.delete(reaction.id);
        } else {
          await supabase.rpc('delete_comment_reaction', { p_comment_id: reaction.comment_id });
          const { data, error } = await supabase.rpc('add_comment_reaction', { 
            p_comment_id: reaction.comment_id, 
            p_reaction_id: reaction.reaction_id 
          });
          if (error) throw error;
          
          const newId = data.id;
          await db.social_comments_reactions.delete(reaction.id);
          await db.social_comments_reactions.put({ ...reaction, id: newId, synced: 1, is_deleted: false });
        }
      } catch (syncError) {
        console.error(`Failed to sync comment reaction for comment ${reaction.comment_id}:`, syncError);
      }
    }

  } catch (error) {
    console.error('Error during reactions synchronization process:', error);
  } finally {
    isSyncingReactions = false;
  }
}

export async function createLocalDirectMessage(messageData: {
    sending_user_id: string;
    receiving_user_id: string;
    direct_message: string;
}) {
    try {
        const tempId = -Date.now();
        const localMessage: LocalDirectMessage = {
            id: tempId,
            created_at: new Date().toISOString(),
            sending_user_id: messageData.sending_user_id,
            receiving_user_id: messageData.receiving_user_id,
            direct_message: messageData.direct_message,
            is_read: 0,
            synced: 0,
        };
        await db.social_user_direct_messages.add(localMessage);
        
        if (navigator.onLine) {
            syncLocalDirectMessages();
        }

        return localMessage;
    } catch (error) {
        console.error('Failed to save direct message to local DB:', error);
        throw error;
    }
}

export async function syncLocalDirectMessages() {
    if (isSyncingDirectMessages || !navigator.onLine) return;
    isSyncingDirectMessages = true;

    try {
        const unsyncedMessages = await db.social_user_direct_messages.where({ synced: 0 }).toArray();
        if (unsyncedMessages.length === 0) {
            isSyncingDirectMessages = false;
            return;
        }

        console.log(`Syncing ${unsyncedMessages.length} direct messages...`);

        for (const message of unsyncedMessages) {
            try {
                if (message.id && message.id < 0) {
                    const tempId = message.id;
                    const messageToInsert = {
                        sending_user_id: message.sending_user_id,
                        receiving_user_id: message.receiving_user_id,
                        direct_message: message.direct_message,
                        created_at: message.created_at,
                        is_read: false,
                    };
                    
                    const { data: newDbMessage, error } = await supabase
                        .from('social_user_direct_messages')
                        .insert(messageToInsert)
                        .select()
                        .single();

                    if (error) throw error;

                    if (newDbMessage) {
                        await db.transaction('rw', db.social_user_direct_messages, async () => {
                            await db.social_user_direct_messages.delete(tempId);
                            await db.social_user_direct_messages.put({
                                ...newDbMessage,
                                is_read: newDbMessage.is_read ? 1 : 0,
                                synced: 1,
                            });
                        });
                    }
                }
            } catch (syncError) {
                console.error(`Failed to sync direct message with temp id ${message.id}:`, syncError);
            }
        }
    } catch (error) {
        console.error('Error during direct message synchronization process:', error);
    } finally {
        isSyncingDirectMessages = false;
    }
}

// --- UPDATED with corrected "Smart Sync" Logic ---
export async function reconcileMessages(userId: string) {
    if (!navigator.onLine || !userId) return;

    try {
        const lastLocalMessage = await db.social_user_direct_messages.orderBy('created_at').last();
        
        let query = supabase
            .from('social_user_direct_messages')
            .select('*')
            .or(`sending_user_id.eq.${userId},receiving_user_id.eq.${userId}`);

        // PATH A: If we have messages locally, fetch only what's new, in the correct order.
        if (lastLocalMessage) {
            query = query.gt('created_at', lastLocalMessage.created_at).order('created_at', { ascending: true });
        } 
        // PATH B: If the DB is empty, fetch the last 250 messages to start, in the correct order for display.
        else {
            query = query.order('created_at', { ascending: false }).limit(250);
        }
        
        const { data: newMessages, error } = await query;

        if (error) throw error;

        if (newMessages && newMessages.length > 0) {
            // If this was a "cold start" (Path B), the messages arrived newest-first, so we must reverse them
            // to get the correct chronological order before storing and displaying.
            if (!lastLocalMessage) {
                newMessages.reverse();
            }

            const messagesToStore = newMessages.map(msg => ({
                ...msg,
                synced: 1,
                is_read: msg.is_read ? 1 : 0,
            }));
            
            await db.social_user_direct_messages.bulkPut(messagesToStore);
        }
    } catch (error) {
        console.error('Failed to reconcile messages:', error);
    }
}