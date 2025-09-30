// lib/local-db.ts

import Dexie, { Table } from 'dexie';
import type { OutputFileEntry } from '@uploadcare/react-uploader';

// --- INTERFACES ---

export interface LocalUserProfile {
 user_id: string;
 created_at: string;
 firstName: string;
 lastName: string;
 displayName: string;
 email: string;
 username: string;
 profileImage: string;
}

export interface LocalPost {
 id: number;
 created_at: string;
 author_id: string;
 post_content: string;
 related_post_id?: number | null;
 synced: 0 | 1;
 post_type: 'User' | 'Ad' | 'Suggestion' | 'Sponsored' | 'OTD';
 post_status: 'pending' | 'approved' | 'flagged' | 'rejected' | 'reported' | 'appealed';
 post_visibility?: number;
 allow_comments?: boolean;
 totalreactions: number;
 totalcomments: number;
 totalshares: number;
 metadata?: { [key: string]: any }; 
 is_deleted?: boolean;
 images?: OutputFileEntry[];
 newImages?: OutputFileEntry[];
 deletedImages?: number[];
 tags?: LocalSocialTag[];
 comments?: LocalComment[];
}

export interface LocalComment {
 id: number;
 post_id: number;
 author_id: string;
 parent_comment_id: number | null;
 comment_content: string;
 depth: number;
 path: number[];
 synced: 0 | 1;
 status: 'pending' | 'approved' | 'flagged' | 'rejected';
 created_at: Date;
 is_deleted?: boolean; 
 images?: OutputFileEntry[];
 newImages?: OutputFileEntry[];
 deletedImages?: number[];
}

export interface LocalPostImage {
 id: number;
 post_id: number;
 user_id: string;
 image_url: string;
 created_at: string;
}

export interface LocalCommentImage {
 id: number;
 comment_id: number;
 user_id: string;
 image_url: string;
 created_at: string;
}

export interface LocalSavedPost {
 id: number;
 user_id: string;
 post_id: number;
 created_at: string;
}

export interface LocalVisibilityOption {
 id: number;
 visible_to: string;
 sort?: number;
 visibility_icon?: string;
}

export interface LocalNotification {
 id: number;
 created_at: string;
 last_sending_user_id: string;
 receiving_user_id: string;
 notification_type: 'mention' | 'new_comment' | 'reply' | 'reaction' | 'share' | 'new_message';
 entity_type: 'post' | 'comment' | 'direct_message';
 data: {
  entity_id: number;
  post_id?: number;
  senders?: string[];
 };
 is_read: 0 | 1;
}

export interface LocalReactionType {
 id: number;
 reaction: string;
 reaction_icon: string;
 colour: string;
 reacted_text: string;
}

export interface LocalPostReaction {
 id: number;
 post_id: number;
 reaction_id: number;
 user_id: string;
 synced?: 0 | 1;
 is_deleted?: boolean;
}

export interface LocalCommentReaction {
 id: number;
 comment_id: number;
 reaction_id: number;
 user_id: string;
 synced?: 0 | 1;
 is_deleted?: boolean;
}

export interface LocalSocialTag {
 id: number;
 tag_name: string;
 tag_displayname: string;
 tag_status: number;
 is_category: number;
}

export interface LocalPostTag {
 id: number;
 post_id: number;
 tag_id: number;
}

export interface LocalUserConnection {
 id: number;
 user_id: string;
 target_user_id: string;
 status: 'pending' | 'active' | 'blocked';
 created_at: string;
 updated_at: string;
}

export interface LocalUserFollow {
 id: number;
 follower_id: string;
 following_id: string;
 created_at: string;
}

export interface LocalDirectMessage {
 id?: number;
  conversation_id: number;
 created_at: string;
 sending_user_id: string;
 direct_message: string;
 is_read: 0 | 1;
 synced: 0 | 1;
}

export interface LocalDeletedMessage {
  id?: number;
  message_id: number;
  user_id: string;
  synced: 0 | 1;
}

export interface LocalConversation {
    id: number;
    created_at: string;
    last_message_at: string;
}

export interface LocalConversationParticipant {
    id: number;
    conversation_id: number;
    user_id: string;
}

export class SocialDatabase extends Dexie {
 social_posts!: Table<LocalPost>;
 userProfile!: Table<LocalUserProfile>;
 social_post_comments!: Table<LocalComment>;
 social_post_visibilityoptions!: Table<LocalVisibilityOption>;
 social_comment_images!: Table<LocalCommentImage>;
 social_saved_posts!: Table<LocalSavedPost>;
 social_post_images!: Table<LocalPostImage>;
 social_user_notifications!: Table<LocalNotification>;
 social_reactions!: Table<LocalReactionType>;
 social_posts_reactions!: Table<LocalPostReaction>;
 social_comments_reactions!: Table<LocalCommentReaction>;
 social_tags!: Table<LocalSocialTag>;
 social_post_tags!: Table<LocalPostTag>;
 social_user_connections!: Table<LocalUserConnection>;
 social_user_follows!: Table<LocalUserFollow>;
 social_user_direct_messages!: Table<LocalDirectMessage>;
 social_deleted_messages!: Table<LocalDeletedMessage>;
  social_conversations!: Table<LocalConversation>;
  social_conversation_participants!: Table<LocalConversationParticipant>;
 
 constructor() {
  super('SocialDatabase');
    // --- UPDATED --- Incremented version number to 36 to apply the schema change
  this.version(36).stores({
   social_posts: '++id, author_id, created_at, synced, is_deleted, related_post_id',
   userProfile: 'user_id, &username, displayName',
   social_post_comments: '++id, post_id, author_id, parent_comment_id, synced, is_deleted',
   social_post_visibilityoptions: 'id, sort',
   social_comment_images: '++id, comment_id, user_id',
   social_saved_posts: '++id, &[user_id+post_id]',
   social_post_images: '++id, post_id, user_id',
   social_user_notifications: '++id, receiving_user_id, is_read, notification_type, created_at, [receiving_user_id+is_read], [receiving_user_id+is_read+notification_type]',
   social_reactions: 'id',
   social_posts_reactions: '++id, &[user_id+post_id], post_id, synced, is_deleted, [synced+user_id]',
   social_comments_reactions: '++id, &[user_id+comment_id], comment_id, synced, is_deleted, [synced+user_id]',
   social_tags: '++id, tag_name, tag_displayname, [tag_status+is_category]',
   social_post_tags: '++id, &[post_id+tag_id], post_id',
   social_user_connections: '++id, &[user_id+target_user_id], status',
   social_user_follows: '++id, &[follower_id+following_id], follower_id, following_id',
      // --- UPDATED --- Removed the obsolete field and index from the schema definition
   social_user_direct_messages: '++id, conversation_id, sending_user_id, is_read, created_at, synced',
   social_deleted_messages: '++id, &[user_id+message_id], synced',
      social_conversations: '++id, last_message_at',
      social_conversation_participants: '++id, &[conversation_id+user_id], user_id',
  });
 }
}

export const db = new SocialDatabase();