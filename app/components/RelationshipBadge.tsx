// app/components/RelationshipBadge.tsx
'use client';

import { SlPeople, SlUserFollowing } from "react-icons/sl"; 
import { useRelationshipStatus } from "@/app/hooks/useRelationshipStatus";

interface RelationshipBadgeProps {
    currentUserId: string;
    authorId: string;
}

const RelationshipBadge = ({ currentUserId, authorId }: RelationshipBadgeProps) => {
    // The complex logic is now handled by our custom hook
    const { isConnected, isFollowing, isPending } = useRelationshipStatus(currentUserId, authorId);

    if (isConnected) {
        return <span className="relationship-badge-connected"><SlPeople className='post-icon' size={12} />Connected</span>;
    }

    if (isPending) {
        return <span className="relationship-badge-following"><SlUserFollowing className='post-icon' size={12} />Connection Request Pending</span>;
    }

    if (isFollowing) {
        return <span className="relationship-badge-following"><SlUserFollowing className='post-icon' size={12} />Following</span>;
    }

    return null;
};

export default RelationshipBadge;