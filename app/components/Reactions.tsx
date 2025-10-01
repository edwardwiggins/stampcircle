// app/components/Reactions.tsx
'use client';

import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, LocalPostReaction, LocalCommentReaction, LocalMessageReaction, LocalReactionType, LocalUserProfile } from '@/app/lib/local-db';
import Image from 'next/image';
import { SlLike } from 'react-icons/sl';
import { syncLocalReactions } from '@/app/lib/supabase-sync-utils';
import { trackEvent } from '@/app/lib/analytics';
import { useUser } from '@/app/context/user-context';

interface ReactionsProps {
 entityId: number;
  // --- UPDATED --- Added 'direct_message' as a possible type
 entityType: 'post' | 'comment' | 'direct_message';
 userProfile: LocalUserProfile | null;
 displayStyle?: 'button' | 'text';
}

export default function Reactions({ entityId, entityType, userProfile, displayStyle = 'button' }: ReactionsProps) {
 const [isPopupVisible, setIsPopupVisible] = useState(false);
 let hoverTimeout: NodeJS.Timeout;
 const { supabase } = useUser();

 const reactionTypes = useLiveQuery(() => db.social_reactions.toArray(), []);

  // --- UPDATED --- Logic to handle all three reaction table types
  const getReactionTable = () => {
    switch (entityType) {
        case 'post': return db.social_posts_reactions;
        case 'comment': return db.social_comments_reactions;
        case 'direct_message': return db.social_direct_message_reactions;
        default: throw new Error('Invalid reaction entity type');
    }
  };
  const reactionTable = getReactionTable();
  const queryKey = entityType === 'post' ? 'post_id' : entityType === 'comment' ? 'comment_id' : 'message_id';

 const currentUserReaction = useLiveQuery(
  () => userProfile 
   ? reactionTable.where({ [queryKey]: entityId, user_id: userProfile.user_id }).and(r => !r.is_deleted).first() 
   : undefined,
  [entityId, userProfile, entityType]
 );

 const currentReactionType = reactionTypes?.find(
  rt => rt.id === currentUserReaction?.reaction_id
 );

 const handleMouseEnter = () => { clearTimeout(hoverTimeout); setIsPopupVisible(true); };
 const handleMouseLeave = () => { hoverTimeout = setTimeout(() => { setIsPopupVisible(false); }, 300); };

 const handleReactionSelect = async (reaction: LocalReactionType) => {
  if (!userProfile) return;
  setIsPopupVisible(false);

  if (currentUserReaction && currentUserReaction.reaction_id === reaction.id) {
   await reactionTable.update(currentUserReaction.id, { is_deleted: true, synced: 0 });
   if (entityType === 'post') {
    await db.social_posts.where({ id: entityId }).modify(post => { if (post.totalreactions > 0) post.totalreactions--; });
   }
   trackEvent('reaction_removed', { entity_id: entityId, entity_type: entityType, reaction_id: reaction.id });
   syncLocalReactions(supabase);
   return;
  }

  if (currentUserReaction) {
   await reactionTable.update(currentUserReaction.id, { reaction_id: reaction.id, synced: 0, is_deleted: false });
  } else {
   const newReaction = { [queryKey]: entityId, user_id: userProfile.user_id, reaction_id: reaction.id, synced: 0, is_deleted: false };
   await reactionTable.add(newReaction as any);
   if (entityType === 'post') {
    await db.social_posts.where({ id: entityId }).modify(post => { post.totalreactions++; });
   }
  }
  
  trackEvent('reaction_added', { entity_id: entityId, entity_type: entityType, reaction_id: reaction.id });
  syncLocalReactions(supabase);
 };
  
  const handleButtonClick = async () => {
    if (!userProfile) return;
    
    if (currentUserReaction) {
      const reactionId = currentUserReaction.reaction_id;
      await reactionTable.update(currentUserReaction.id, { is_deleted: true, synced: 0 });
      if (entityType === 'post') {
        await db.social_posts.where({ id: entityId }).modify(post => { if (post.totalreactions > 0) post.totalreactions--; });
      }
      trackEvent('reaction_removed', { entity_id: entityId, entity_type: entityType, reaction_id: reactionId });
    } else {
      const defaultReactionId = 1; // Assuming "Like" is ID 1
      const newReaction = { [queryKey]: entityId, user_id: userProfile.user_id, reaction_id: defaultReactionId, synced: 0, is_deleted: false };
      await reactionTable.add(newReaction as any);
      if (entityType === 'post') {
        await db.social_posts.where({ id: entityId }).modify(post => { post.totalreactions++; });
      }
      trackEvent('reaction_added', { entity_id: entityId, entity_type: entityType, reaction_id: defaultReactionId });
    }
        // --- UPDATED --- Pass supabase to the function
    syncLocalReactions(supabase);
  };
  
  const buttonStyle = currentReactionType ? { color: currentReactionType.colour } : {};
  const containerClassName = displayStyle === 'button' ? 'footer-action' : 'comment-response';

  return (
    <div 
      className="reactions-container"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {isPopupVisible && reactionTypes && (
        <div className="reactions-popup">
          {reactionTypes.map(reaction => (
            <Image
              key={reaction.id}
              src={reaction.reaction_icon}
              alt={reaction.reaction}
              width={40}
              height={40}
              className="reaction-icon"
              data-tooltip-id="app-tooltip"
              data-tooltip-content={reaction.reaction}
              onClick={() => handleReactionSelect(reaction)}
            />
          ))}
        </div>
      )}
      
      <div className={containerClassName} onClick={handleButtonClick} style={buttonStyle}>
        {currentReactionType ? (
          <>
            <Image src={currentReactionType.reaction_icon} alt={currentReactionType.reaction} width={20} height={20} className='post-icon' />
            {currentReactionType.reacted_text}
          </>
        ) : (
          <>
            {displayStyle === 'button' && <SlLike className='post-icon' size={16} />}
            Like
          </>
        )}
      </div>
    </div>
  );
}