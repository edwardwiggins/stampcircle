// app/components/messages/ReactionSummary.tsx
'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/app/lib/local-db';
import Image from 'next/image';

interface ReactionSummaryProps {
    messageId: number;
}

const ReactionSummary = ({ messageId }: ReactionSummaryProps) => {
    const reactions = useLiveQuery(() => 
        db.social_direct_message_reactions
            .where({ message_id: messageId })
            .and(r => !r.is_deleted)
            .toArray(),
        [messageId]
    );

    const reactionTypes = useLiveQuery(() => db.social_reactions.toArray());

    if (!reactions || reactions.length === 0 || !reactionTypes) {
        return null;
    }

    const reactionGroups = reactions.reduce((acc, reaction) => {
        acc[reaction.reaction_id] = (acc[reaction.reaction_id] || 0) + 1;
        return acc;
    }, {} as Record<number, number>);

    const reactionTypeMap = new Map(reactionTypes.map(rt => [rt.id, rt]));

    return (
        <div className="flex items-center gap-1 p-1">
            {Object.entries(reactionGroups).map(([reactionId, count]) => {
                const reactionType = reactionTypeMap.get(Number(reactionId));
                if (!reactionType) return null;

                return (
                    <div key={reactionId} className="reaction-summary-badge">
                        <Image 
                            src={reactionType.reaction_icon}
                            alt={reactionType.reaction}
                            width={16}
                            height={16}
                        />
                        <span className="text-xs ml-1">{count}</span>
                    </div>
                );
            })}
        </div>
    );
};

export default ReactionSummary;