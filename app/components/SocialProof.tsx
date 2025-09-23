// app/components/SocialProof.tsx
'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { db, LocalUserProfile } from '@/app/lib/local-db';
import { useMemo } from 'react';

interface SocialProofProps {
    postId: number;
    currentUserId: string;
}

const SocialProof = ({ postId, currentUserId }: SocialProofProps) => {
    const reactions = useLiveQuery(() => db.social_posts_reactions.where('post_id').equals(postId).toArray(), [postId], []);
    const followingList = useLiveQuery(() => db.social_user_follows.where('follower_id').equals(currentUserId).toArray(), [currentUserId], []);
    
    const followingIds = useMemo(() => new Set(followingList.map(f => f.following_id)), [followingList]);

    const reactors = useLiveQuery(async () => {
        if (!reactions || reactions.length === 0) return [];
        const reactorIds = reactions.map(r => r.user_id);
        return db.userProfile.where('user_id').anyOf(reactorIds).toArray();
    }, [reactions], []);

    if (!reactions || reactions.length === 0 || !reactors || reactors.length === 0) {
        return <p>{reactions?.length || 0} reactions</p>;
    }

    const currentUserReacted = reactions.some(r => r.user_id === currentUserId);
    
    const followedReactors = reactors.filter(
        reactor => reactor.user_id !== currentUserId && followingIds.has(reactor.user_id)
    );

    const namesToShow: string[] = [];
    if (currentUserReacted) {
        namesToShow.push('You');
    }
    namesToShow.push(...followedReactors.slice(0, 2 - namesToShow.length).map(u => u.displayName));

    const totalReactors = reactions.length;
    const othersCount = totalReactors - namesToShow.length;

    if (totalReactors === 0) {
        return <p>0 reactions</p>;
    }

    let proofText = namesToShow.join(', ');

    if (othersCount > 0) {
        proofText += ` and ${othersCount} other${othersCount > 1 ? 's' : ''}`;
    }

    proofText += ` reacted to this`;

    return (
        <div className="social-proof-banner">
            <p>{proofText}</p>
        </div>
    );
};

export default SocialProof;