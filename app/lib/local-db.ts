import Dexie, { Table } from 'dexie';
import type { OutputFileEntry } from '@uploadcare/react-uploader';

export interface UnsyncedImage {
    uuid: string;
    cdnUrl: string;
}

export interface LocalVisibilityOption {
    id: number;
    visible_to: string;
    sort?: number;
    visibility_icon?: string;
}

export interface LocalPost {
    id: number;
    created_at: string;
    author_id: string;
    post_content: string;
    synced: 0 | 1;
    post_type: 'User' | 'Ad' | 'Suggestion' | 'Sponsored'; 
    post_status: 'pending' | 'approved' | 'flagged' | 'rejected';
    post_visibility?: number;
    allow_comments?: boolean;
    totalreactions: number;
    totalcomments: number;
    totalshares: number;
    metadata?: { [key: string]: any }; 
    is_deleted?: boolean;
}

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
    images?: UnsyncedImage[];
    newImages?: OutputFileEntry[];
    deletedImages?: number[];
}

export interface LocalCommentImage {
    id: number;
    comment_id: number;
    user_id: string;
    image_url: string;
    created_at: string;
}

export async function updatePostAggregates(postId: number, key: string, value: number) {
    try {
        await db.social_posts.update(postId, { [key]: value });
    } catch (error) {
        console.error(`Failed to update post ${postId} aggregate for key ${key}:`, error);
    }
}

export class SocialDatabase extends Dexie {
    social_posts!: Table<LocalPost>;
    userProfile!: Table<LocalUserProfile>;
    social_post_comments!: Table<LocalComment>;
    social_post_visibilityoptions!: Table<LocalVisibilityOption>;
    social_comment_images!: Table<LocalCommentImage>;
    
    constructor() {
        super('SocialDatabase');
        this.version(13).stores({
            social_posts: '++id, author_id, created_at, synced, [is_deleted]',
            userProfile: 'user_id',
            social_post_comments: '++id, post_id, author_id, parent_comment_id, synced, [is_deleted], images, newImages, deletedImages',
            social_post_visibilityoptions: 'id, sort',
            social_comment_images: '++id, comment_id, user_id'
        });
    }
}

export const db = new SocialDatabase();