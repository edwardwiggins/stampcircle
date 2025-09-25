// app/hooks/useRelationshipStatus.ts
'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/app/lib/local-db';

/**
 * A custom hook to determine the relationship status between the current user and another user.
 * @param currentUserId The UUID of the currently logged-in user.
 * @param authorId The UUID of the user to check the relationship against.
 * @returns An object with status flags { isConnected, isFollowing, isPending, requestSentByMe }.
 */
export const useRelationshipStatus = (currentUserId?: string, authorId?: string) => {
    
    const status = useLiveQuery(async () => {
        if (!currentUserId || !authorId || currentUserId === authorId) {
            return { isConnected: false, isFollowing: false, isPending: false, requestSentByMe: false };
        }

        const connection = await db.social_user_connections
            .where('[user_id+target_user_id]').equals([currentUserId, authorId])
            .or('[user_id+target_user_id]').equals([authorId, currentUserId])
            .and(conn => conn.status === 'active')
            .first();

        const follow = await db.social_user_follows
            .where({ follower_id: currentUserId, following_id: authorId })
            .first();

        const pending = await db.social_user_connections
            .where('[user_id+target_user_id]').equals([currentUserId, authorId])
            .or('[user_id+target_user_id]').equals([authorId, currentUserId])
            .and(conn => conn.status === 'pending')
            .first();

        return {
            isConnected: !!connection,
            isFollowing: !!follow,
            isPending: !!pending,
            // --- NEW --- Check if the pending request was sent by the current user
            requestSentByMe: !!pending && pending.user_id === currentUserId,
        };
    }, [currentUserId, authorId], { isConnected: false, isFollowing: false, isPending: false, requestSentByMe: false }); // Default value

    return status;
};