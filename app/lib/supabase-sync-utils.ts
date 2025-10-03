// lib/supabase-sync-utils.ts

import { db } from './local-db';
import { LocalPost, LocalComment, LocalPostImage, LocalCommentImage, LocalUserProfile, LocalNotification, LocalSocialTag, LocalUserConnection, LocalDirectMessage, LocalDeletedMessage } from './local-db';
import type { OutputFileEntry } from '@uploadcare/react-uploader';
import { SupabaseClient } from '@supabase/supabase-js';

let isSyncingPosts = false;
let isSyncingComments = false;
let isSyncingReactions = false;
let isSyncingDirectMessages = false;
let isSyncingDeletedMessages = false;

export async function syncUserSocialGraph(supabase: SupabaseClient, userId: string) {
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
{/*
export async function fetchPaginatedFeed(supabase: SupabaseClient, userId: string, page: number, pageSize: number = 10) {
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
} */}

const extractMentions = (content: string, pattern: RegExp): { display: string, id: string }[] => {
 const matches = [...content.matchAll(pattern)];
 return matches.map(match => ({ display: match[1], id: match[2] }));
};

const processPostTags = async (supabase: SupabaseClient, post: LocalPost) => {
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

export async function syncLocalPosts(supabase: SupabaseClient) {
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
      await processPostTags(supabase, { ...post, id: newPostData.id });
      
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
     await processPostTags(supabase, post);

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

export async function syncLocalComments(supabase: SupabaseClient) {
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
       created_at: comment.created_at,
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

export async function syncLocalReactions(supabase: SupabaseClient) {
 if (isSyncingReactions || !navigator.onLine) return;
 isSyncingReactions = true;

 try {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
        isSyncingReactions = false;
        return;
    };

  const unsyncedPostReactions = await db.social_posts_reactions.where({ synced: 0, user_id: user.id }).toArray();
  for (const reaction of unsyncedPostReactions) {
   try {
    if (reaction.is_deleted) {
     await supabase.rpc('delete_post_reaction', { p_post_id: reaction.post_id });
     await db.social_posts_reactions.delete(reaction.id!);
    } else {
     await supabase.rpc('delete_post_reaction', { p_post_id: reaction.post_id });
     const { data, error } = await supabase.rpc('add_post_reaction', { 
      p_post_id: reaction.post_id, 
      p_reaction_id: reaction.reaction_id 
     });
     if (error) throw error;
     
     const newId = data.id;
     await db.social_posts_reactions.delete(reaction.id!);
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
     await db.social_comments_reactions.delete(reaction.id!);
    } else {
     await supabase.rpc('delete_comment_reaction', { p_comment_id: reaction.comment_id });
     const { data, error } = await supabase.rpc('add_comment_reaction', { 
      p_comment_id: reaction.comment_id, 
      p_reaction_id: reaction.reaction_id 
     });
     if (error) throw error;
     
     const newId = data.id;
     await db.social_comments_reactions.delete(reaction.id!);
     await db.social_comments_reactions.put({ ...reaction, id: newId, synced: 1, is_deleted: false });
    }
   } catch (syncError) {
    console.error(`Failed to sync comment reaction for comment ${reaction.comment_id}:`, syncError);
   }
  }

    const unsyncedMessageReactions = await db.social_direct_message_reactions.where({ synced: 0, user_id: user.id }).toArray();
    for (const reaction of unsyncedMessageReactions) {
        try {
            if (reaction.is_deleted) {
                await supabase.rpc('delete_message_reaction', { p_message_id: reaction.message_id });
                await db.social_direct_message_reactions.delete(reaction.id!);
            } else {
                await supabase.rpc('delete_message_reaction', { p_message_id: reaction.message_id });
                const { data, error } = await supabase.rpc('add_message_reaction', { 
                    p_message_id: reaction.message_id, 
                    p_reaction_id: reaction.reaction_id 
                });
                if (error) throw error;
                
                const newId = data.id;
                await db.social_direct_message_reactions.delete(reaction.id!);
                await db.social_direct_message_reactions.put({ ...reaction, id: newId, synced: 1, is_deleted: false });
            }
        } catch (syncError) {
            console.error(`Failed to sync message reaction for message ${reaction.message_id}:`, syncError);
        }
    }

 } catch (error) {
  console.error('Error during reactions synchronization process:', error);
 } finally {
  isSyncingReactions = false;
 }
}

export async function findOrCreateConversation(supabase: SupabaseClient, currentUserId: string, partnerId: string): Promise<number | null> {
    if (!currentUserId || !partnerId) return null;
    try {
        // Call an RPC function to find or create a 1-on-1 conversation
        const { data, error } = await supabase.rpc('find_or_create_conversation', {
            partner_id: partnerId
        });

        if (error) {
            console.error('Error finding or creating conversation:', error);
            throw error;
        }
        
        return data as number;

    } catch (err) {
        console.error('Client-side error in findOrCreateConversation:', err);
        return null;
    }
}

export async function createLocalDirectMessage(messageData: {
  conversation_id: number;
  sending_user_id: string;
  direct_message: string;
  attachments?: OutputFileEntry[];
  reply_to_message_id?: number | null;
}) {
  try {
    const tempId = -Date.now();
    const localMessage: LocalDirectMessage = {
      id: tempId,
      created_at: new Date().toISOString(),
      sending_user_id: messageData.sending_user_id,
      conversation_id: messageData.conversation_id,
      direct_message: messageData.direct_message,
      reply_to_message_id: messageData.reply_to_message_id,
      is_read: 0,
      synced: 0,
      attachments: messageData.attachments || [], // Save attachments locally
    };
    await db.social_user_direct_messages.add(localMessage);
    return localMessage;
  } catch (error) {
    console.error('Failed to save direct message to local DB:', error);
    throw error;
  }
}

export async function syncLocalDirectMessages(supabase: SupabaseClient) {
  if (isSyncingDirectMessages || !navigator.onLine) return;
  isSyncingDirectMessages = true;

  try {
    const unsyncedMessages = await db.social_user_direct_messages.where({ synced: 0 }).toArray();
    if (unsyncedMessages.length === 0) {
            isSyncingDirectMessages = false;
            return;
        }

    for (const message of unsyncedMessages) {
      try {
        if (message.id && message.id < 0) {
          const tempId = message.id;
          const { data: newDbMessage, error } = await supabase
            .from('social_user_direct_messages')
            .insert({
                            sending_user_id: message.sending_user_id,
                            conversation_id: message.conversation_id,
                            direct_message: message.direct_message,
                            created_at: message.created_at,
                            reply_to_message_id: message.reply_to_message_id,
                        })
            .select()
            .single();

          if (error) throw error;
          if (newDbMessage) {
                        // --- THE FIX IS HERE ---
                        if (message.attachments && message.attachments.length > 0) {
                            const attachmentsToInsert = message.attachments.map(file => ({
                                message_id: newDbMessage.id,
                                user_id: newDbMessage.sending_user_id,
                                file_path: file.cdnUrl!,
                                file_type: file.mimeType,
                                file_name: file.fileInfo?.originalFilename
                            }));

                            // 1. Insert into Supabase and get the final records back
                            const { data: newAttachments, error: attachmentError } = await supabase
                                .from('social_message_attachments')
                                .insert(attachmentsToInsert)
                                .select();
                            
                            if (attachmentError) throw attachmentError;

                            // 2. CRITICAL STEP: Save the final attachment records to the local DB
                            if (newAttachments) {
                                await db.social_message_attachments.bulkPut(newAttachments);
                            }
                        }

            await db.transaction('rw', db.social_user_direct_messages, async () => {
              await db.social_user_direct_messages.delete(tempId);
                            // Now we put the final message, without the temporary 'attachments' property
                            const { attachments, ...restOfMessage } = message;
              await db.social_user_direct_messages.put({
                ...restOfMessage,
                                ...newDbMessage,
                is_read: newDbMessage.is_read ? 1 : 0,
                synced: 1,
              });
            });
            await supabase.from('social_conversations').update({ last_message_at: newDbMessage.created_at }).eq('id', newDbMessage.conversation_id);
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

export async function reconcileMessages(supabase: SupabaseClient, userId: string) {
  if (!navigator.onLine || !userId) return;

  try {
    const { data: participantRecords, error: pError } = await supabase.from('social_conversation_participants').select('conversation_id').eq('user_id', userId);
        if (pError) throw pError;
        const conversationIds = participantRecords.map(p => p.conversation_id);
        if (conversationIds.length === 0) return;

    const { data: conversations, error: convoError } = await supabase
      .from('social_conversations')
      .select(`*, social_conversation_participants!inner(*)`)
      .in('id', conversationIds);
    if (convoError) throw convoError;
    if (!conversations || conversations.length === 0) return;

// --- UPDATED LOGIC ---
        // This transaction now clears old participants before adding the new, correct list.
        await db.transaction('rw', db.social_conversations, db.social_conversation_participants, async () => {
            // Get a list of all local participant records for the relevant conversations
            const localParticipants = await db.social_conversation_participants
                .where('conversation_id').anyOf(conversationIds).toArray();
            
            // Delete all of them to ensure a clean slate
            await db.social_conversation_participants.bulkDelete(localParticipants.map(p => p.id));

            // Now, save the fresh data from the server
        await db.social_conversations.bulkPut(conversations);
        const allParticipants = conversations.flatMap(c => c.social_conversation_participants);
        await db.social_conversation_participants.bulkPut(allParticipants);
        });
        // --- END OF UPDATED LOGIC ---

    const sortedMessages = await db.social_user_direct_messages.where('conversation_id').anyOf(conversationIds).sortBy('created_at');
        const lastLocalMessage = sortedMessages.length > 0 ? sortedMessages[sortedMessages.length - 1] : undefined;
    const lastSyncTimestamp = lastLocalMessage ? lastLocalMessage.created_at : new Date(0).toISOString();

        // --- UPDATED LOGIC ---
    // First, fetch the new messages
    const { data: newMessages, error: messagesError } = await supabase
      .from('social_user_direct_messages')
      .select('*') 
      .in('conversation_id', conversationIds)
      .gt('created_at', lastSyncTimestamp);

    if (messagesError) throw messagesError;

    if (newMessages && newMessages.length > 0) {
            const messagesToStore = newMessages.map(msg => ({ ...msg, synced: 1, is_read: msg.is_read ? 1 : 0 }));
            await db.social_user_direct_messages.bulkPut(messagesToStore);

            // Second, fetch the attachments for ONLY those new messages
            const messageIds = newMessages.map(m => m.id);
            const { data: attachments, error: attachmentsError } = await supabase
                .from('social_message_attachments')
                .select('*')
                .in('message_id', messageIds);

            if (attachmentsError) throw attachmentsError;
            
            if (attachments && attachments.length > 0) {
                await db.social_message_attachments.bulkPut(attachments);
            }
    }
  } catch (error) {
    console.error('Failed to reconcile messages:', error);
  }
}

export async function deleteMessageForMe(messageId: number, userId: string) {
  try {
    const deletionRecord: LocalDeletedMessage = {
      message_id: messageId,
      user_id: userId,
      synced: 0
    };
    await db.social_deleted_messages.add(deletionRecord);
  } catch (error) {
    console.error('Error deleting message for me locally:', error);
  }
}

export async function deleteMessageForEveryone(supabase: SupabaseClient, messageId: number) {
  try {
    await db.social_user_direct_messages.delete(messageId);
    const { error } = await supabase
      .from('social_user_direct_messages')
      .delete()
      .eq('id', messageId);

    if (error) {
      console.error('Error deleting message for everyone on server:', error);
    }
  } catch (error) {
    console.error('Error deleting message for everyone:', error);
  }
}

export async function syncDeletedMessages(supabase: SupabaseClient) {
  if (isSyncingDeletedMessages || !navigator.onLine) return;
  isSyncingDeletedMessages = true;
  try {
    const unsyncedDeletions = await db.social_deleted_messages.where({ synced: 0 }).toArray();
    if (unsyncedDeletions.length === 0) return;

    const recordsToInsert = unsyncedDeletions.map(({ id, ...rest }) => rest);
    const { data, error } = await supabase.from('social_deleted_messages').insert(recordsToInsert).select();

    if (error) throw error;

    if (data) {
      const syncedIds = unsyncedDeletions.map(d => d.id!);
      await db.social_deleted_messages.where('id').anyOf(syncedIds).modify({ synced: 1 });
    }
  } catch (error) {
    console.error('Error syncing deleted messages:', error);
  } finally {
    isSyncingDeletedMessages = false;
  }
}

// --- NEW --- This function implements your proposed notification sync logic
export async function reconcileNotifications(supabase: SupabaseClient, userId: string) {
    if (!navigator.onLine || !userId) return;

    try {
        // Calculate the date 14 days ago
        const twoWeeksAgo = new Date();
        twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
        const twoWeeksAgoISO = twoWeeksAgo.toISOString();

        // Build the query with the OR condition
        // Rule 1: is_read is false (gets all unread, regardless of age)
        // Rule 2: created_at is greater than or equal to two weeks ago (gets all recent)
        const { data: serverNotifications, error } = await supabase
            .from('social_user_notifications')
            .select('*')
            .eq('receiving_user_id', userId)
            .or(`is_read.eq.false,created_at.gte.${twoWeeksAgoISO}`);

        if (error) throw error;

        if (serverNotifications && serverNotifications.length > 0) {
            const notificationsToStore = serverNotifications.map(n => ({
                ...n,
                is_read: n.is_read ? 1 : 0,
            }));
            // Overwrite local notifications with the complete, correct set from the server
            await db.transaction('rw', db.social_user_notifications, async () => {
                // To keep it simple, we clear the user's old notifications and replace them.
                // This ensures any dismissed (read) notifications older than 14 days are removed.
                await db.social_user_notifications.where({ receiving_user_id: userId }).delete();
                await db.social_user_notifications.bulkPut(notificationsToStore);
            });
        }
    } catch (error) {
        console.error("Error reconciling notifications:", error);
    }
}

// --- NEW --- This function calls our powerful "head chef" RPC to get the dynamic feed
export async function fetchStructuredFeed(supabase: SupabaseClient, { pageParam = 0 }) {
    if (!supabase) return { items: [], hasMore: false, nextPage: undefined };
    const pageSize = 10;

    try {
        const { data: feedItems, error } = await supabase.rpc('generate_structured_feed', {
            p_page: pageParam,
            p_page_size: pageSize
        });

        if (error) throw error;
        if (!feedItems || (feedItems as any[]).length === 0) {
            return { items: [], hasMore: false, nextPage: undefined };
        }

        const postIds = new Set<number>();
        (feedItems as any[]).forEach(item => {
            if (item.type === 'post' && item.data) {
                postIds.add(item.data.id);
            } else if (item.type === 'carousel' && item.items) {
                item.items.forEach((post: LocalPost) => postIds.add(post.id));
            }
        });

        const allPostIds = Array.from(postIds);
        if (allPostIds.length === 0) {
            const hasPosts = (feedItems as any[]).some(item => item.type === 'post');
            return { items: feedItems, hasMore: hasPosts, nextPage: hasPosts ? pageParam + 1 : undefined };
        }

        const [
            postImagesResult,
            postTagsResult,
            commentsResult,
            postReactionsResult,
            authorIdsResult
        ] = await Promise.all([
            supabase.from('social_post_images').select('*').in('post_id', allPostIds),
            supabase.from('social_post_tags').select('*, social_tags(*)').in('post_id', allPostIds),
            supabase.from('social_post_comments').select('*, social_comment_images(*)').in('post_id', allPostIds),
            supabase.from('social_posts_reactions').select('*').in('post_id', allPostIds),
            supabase.from('social_posts').select('id, author_id').in('id', allPostIds)
        ]);

        const authorIds = new Set<string>(authorIdsResult.data?.map(p => p.author_id));
        commentsResult.data?.forEach(c => authorIds.add(c.author_id));
        const { data: profiles } = await supabase.from('user_profile').select('*').in('user_id', Array.from(authorIds));
        
        await db.transaction('rw', db.social_post_images, db.social_post_tags, db.social_tags, db.social_posts_reactions, db.social_post_comments, db.social_comment_images, db.userProfile, async () => {
            if (postImagesResult.data) await db.social_post_images.bulkPut(postImagesResult.data);
            if (postReactionsResult.data) await db.social_posts_reactions.bulkPut(postReactionsResult.data);
            if (profiles) await db.userProfile.bulkPut(profiles);
            
            const tags = postTagsResult.data?.flatMap(pt => pt.social_tags ? [pt.social_tags] : []) || [];
            if (tags.length > 0) await db.social_tags.bulkPut(tags);
            
            const postTags = postTagsResult.data?.map(({ social_tags, ...rest }) => rest) || [];
            if (postTags.length > 0) await db.social_post_tags.bulkPut(postTags);

            if (commentsResult.data) {
                const commentsToStore: LocalComment[] = [];
                const commentImagesToStore: LocalCommentImage[] = [];
                commentsResult.data.forEach((comment: any) => {
                    const { social_comment_images, ...commentData } = comment;
                    commentsToStore.push({ ...commentData, created_at: new Date(commentData.created_at), synced: 1 });
                    if (social_comment_images) {
                        commentImagesToStore.push(...social_comment_images);
                    }
                });
                await db.social_post_comments.bulkPut(commentsToStore);
                if (commentImagesToStore.length > 0) {
                    await db.social_comment_images.bulkPut(commentImagesToStore);
                }
            }
        });
        
        const imagesByPostId = new Map<number, any[]>();
        postImagesResult.data?.forEach(img => {
            if (!imagesByPostId.has(img.post_id)) imagesByPostId.set(img.post_id, []);
            imagesByPostId.get(img.post_id)!.push({ cdnUrl: img.image_url, id: img.id, uuid: img.id.toString() });
        });

        const tagsByPostId = new Map<number, LocalSocialTag[]>();
        postTagsResult.data?.forEach((pt: any) => {
            if (!tagsByPostId.has(pt.post_id)) tagsByPostId.set(pt.post_id, []);
            if (pt.social_tags) tagsByPostId.get(pt.post_id)!.push(pt.social_tags);
        });
        
        const commentsCountByPostId = new Map<number, number>();
        commentsResult.data?.forEach(c => {
           commentsCountByPostId.set(c.post_id, (commentsCountByPostId.get(c.post_id) || 0) + 1);
        });

        const reactionsCountByPostId = new Map<number, number>();
        postReactionsResult.data?.forEach(r => {
            reactionsCountByPostId.set(r.post_id, (reactionsCountByPostId.get(r.post_id) || 0) + 1);
        });

        const enrichedFeedItems = (feedItems as any[]).map(item => {
            const enrichPost = (post: LocalPost): LocalPost => ({
                ...post,
                images: imagesByPostId.get(post.id) || [],
                tags: tagsByPostId.get(post.id) || [],
                totalcomments: commentsCountByPostId.get(post.id) || 0,
                totalreactions: reactionsCountByPostId.get(post.id) || 0,
                synced: 1
            });

            if (item.type === 'post' && item.data) {
                return { ...item, data: enrichPost(item.data) };
            }
            if (item.type === 'carousel' && item.items) {
                return { ...item, items: item.items.map(enrichPost) };
            }
            return item;
        });
        
        const postCount = (feedItems as any[]).filter(item => item.type === 'post').length;
        const hasMore = postCount >= pageSize;

        return { items: enrichedFeedItems, hasMore, nextPage: hasMore ? pageParam + 1 : undefined };
        
    } catch (err) {
        console.error('Error fetching structured feed:', err);
        return { items: [], hasMore: false, nextPage: undefined };
    }
}