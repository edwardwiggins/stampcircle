// app/lib/local-db.ts

import Dexie, { Table } from 'dexie';

export interface LocalPost {
    id: number | string;
    created_at: string;
    author_id: string;
    post_content: string;
    is_synced: boolean;
    // Add other properties from your Supabase table
    totalreactions: number;
    totalcomments: number;
    totalshares: number;
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
    synced: 0 | 1; // 0 = unsynced, 1 = synced
    status: 'pending' | 'approved' | 'flagged' | 'rejected';
    created_at: Date;
}

export async function updatePostAggregates(postId: number, key: string, value: number) {
    try {
        await db.social_posts.update(postId, {
            [key]: value,
        });
        console.log(`Local post ${postId} updated: ${key} = ${value}`);
    } catch (error) {
        console.error(`Failed to update post ${postId} aggregate for key ${key}:`, error);
    }
}

export class SocialDatabase extends Dexie {
    social_posts!: Table<LocalPost>;
    userProfile!: Table<LocalUserProfile>;
    social_post_comments!: Table<LocalComment>;
    
    constructor() {
        super('SocialDatabase');
        this.version(3).stores({
            social_posts: '++id, author_id, created_at, is_synced',
            userProfile: 'user_id',
            social_post_comments: '++id, post_id, author_id, parent_comment_id, synced, status, created_at, *path',
        });
    }
}

export const db = new SocialDatabase();