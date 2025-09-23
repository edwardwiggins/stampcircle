// app/components/RelationshipBadge.tsx
'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/app/lib/local-db';
import { SlPeople } from "react-icons/sl"; 

interface RelationshipBadgeProps {
    currentUserId: string;
    authorId: string;
}

const RelationshipBadge = ({ currentUserId, authorId }: RelationshipBadgeProps) => {
    // Don't show a badge for your own posts
    if (currentUserId === authorId) {
        return null;
    }

    const connection = useLiveQuery(() => 
        db.social_user_connections
            .where('[user_id+target_user_id]')
            .equals([currentUserId, authorId])
            .or('[user_id+target_user_id]')
            .equals([authorId, currentUserId])
            .and(conn => conn.status === 'active')
            .first(),
        [currentUserId, authorId]
    );

    const follow = useLiveQuery(() =>
        db.social_user_follows
            .where({ follower_id: currentUserId, following_id: authorId })
            .first(),
        [currentUserId, authorId]
    );

    if (connection) {
        return <span className="relationship-badge-connected"><SlPeople className='post-icon' size={12} />Connected</span>;
    }

    if (follow) {
        return <span className="relationship-badge-following">Following</span>;
    }

    return null;
};

export default RelationshipBadge;