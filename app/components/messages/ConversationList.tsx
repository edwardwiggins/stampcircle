// app/components/messages/ConversationList.tsx
'use client';

import { useState, useEffect } from 'react';
import { useUser } from '@/app/context/user-context';
import { db } from '@/app/lib/local-db';
import type { LocalDirectMessage, LocalUserProfile, LocalConversation } from '@/app/lib/local-db';
import { useLiveQuery } from 'dexie-react-hooks';
import Image from 'next/image';
import { FiSearch, FiEdit } from 'react-icons/fi';
import '@/app/styles/messages.css';

interface EnrichedConversation {
   conversation: LocalConversation;
  partner: LocalUserProfile;
  lastMessage: LocalDirectMessage | null;
  unreadCount: number;
}

interface ConversationListProps {
   onSelectConversation: (conversationId: number, partnerId: string) => void;
   onNewMessage: () => void;
}

const ConversationList = ({ onSelectConversation, onNewMessage }: ConversationListProps) => {
   const { userProfile, supabase } = useUser();
  const [conversations, setConversations] = useState<EnrichedConversation[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const participantCount = useLiveQuery(() => db.social_conversation_participants.count());
  const messageCount = useLiveQuery(() => db.social_user_direct_messages.count());
    
    // --- UPDATED --- This query is now correct and more robust.
  const unreadCountTrigger = useLiveQuery(() => 
    userProfile 
            ? db.social_user_direct_messages
                .where({ is_read: 0 })
                .and(msg => msg.sending_user_id !== userProfile.user_id)
                .count() 
            : 0, 
  [userProfile]);


   useEffect(() => {
    const fetchAndBuildConversations = async () => {
      if (!userProfile) return;
      setIsLoading(true);
      const currentUserId = userProfile.user_id;

      const userParticipantRecords = await db.social_conversation_participants.where({ user_id: currentUserId }).toArray();
      const conversationIds = userParticipantRecords.map(p => p.conversation_id);
      if (conversationIds.length === 0) {
        setConversations([]);
        setIsLoading(false);
        return;
      }
      
      const [convos, allParticipants, allMessages, allPartners] = await Promise.all([
        db.social_conversations.where('id').anyOf(conversationIds).toArray(),
        db.social_conversation_participants.where('conversation_id').anyOf(conversationIds).and(p => p.user_id !== currentUserId).toArray(),
        db.social_user_direct_messages.where('conversation_id').anyOf(conversationIds).toArray(),
        db.userProfile.toArray()
      ]);
      
      const partnersMap = new Map(allPartners.map(p => [p.user_id, p]));
      const convoPartnerMap = new Map(allParticipants.map(p => [p.conversation_id, p.user_id]));

      const messagesByConvo = new Map<number, LocalDirectMessage[]>();
      for (const msg of allMessages) {
        if (!messagesByConvo.has(msg.conversation_id)) messagesByConvo.set(msg.conversation_id, []);
        messagesByConvo.get(msg.conversation_id)!.push(msg);
      }

      const enrichedConversations: EnrichedConversation[] = convos.map(convo => {
        const partnerId = convoPartnerMap.get(convo.id);
        const partner = partnerId ? partnersMap.get(partnerId) : null;
        const convoMessages = messagesByConvo.get(convo.id) || [];
        convoMessages.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        const lastMessage = convoMessages[0] || null;
        const unreadCount = convoMessages.filter(msg => msg.is_read === 0 && msg.sending_user_id === partnerId).length;

        if (!partner) return null;
        return { conversation: convo, partner, lastMessage, unreadCount };
      }).filter((c): c is EnrichedConversation => c !== null);

      setConversations(enrichedConversations.sort((a, b) => 
        new Date(b.lastMessage?.created_at || b.conversation.last_message_at).getTime() - 
        new Date(a.lastMessage?.created_at || a.conversation.last_message_at).getTime()
      ));
      setIsLoading(false);
    };
    fetchAndBuildConversations();
  }, [userProfile, participantCount, messageCount, unreadCountTrigger]);

return (
 <div className="flex flex-col h-full">
 <div className="p-4 flex-shrink-0">
  <div className="flex justify-between items-center mb-4">
  <h1 className="text-2xl font-bold text-gray-800">Chats</h1>
  <button onClick={onNewMessage} className="p-2 rounded-full hover:bg-gray-200" title="New Message">
   <FiEdit size={20} className="text-gray-600" />
  </button>
  </div>
  <div className="relative m-[0.5em]">
  <FiSearch className="m-[0.25em] absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
  <input 
   type="text" 
   placeholder="Search chats..."
   className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
  />
  </div>
 </div>

 <div className="flex-grow overflow-y-auto">
  {isLoading ? (
   <div className="p-[1em] text-center text-gray-500">Loading chats...</div>
  ) : conversations.length > 0 ? (
  conversations.map(({ conversation, partner, lastMessage, unreadCount }) => (
   <div 
   key={conversation.id} 
   onClick={() => onSelectConversation(conversation.id, partner.user_id)}
   className="conversation-block"
   >
   <Image
    src={partner.profileImage || '/default-avatar.jpg'}
    alt={partner.displayName}
    width={50}
    height={50}
    className="rounded-full"
   />
   <div className="conversation">
    <div className="conversation-detail">
    <h3 className="username">{partner.displayName}</h3>
    <span className="conversation-time">
     {lastMessage ? new Date(lastMessage.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
    </span>
    </div>
    <div className="flex justify-between items-center">
     <p className="message-preview">
     {lastMessage?.direct_message || '...'}
     </p>
     {unreadCount > 0 && (
      <span className="ml-2 bg-red-500 text-white text-xs w-5 h-5 flex items-center justify-center rounded-full">
       {unreadCount}
      </span>
     )}
    </div>
   </div>
   </div>
  ))
  ) : (
   conversations && <div className="p-[1em] text-center text-gray-500">
    No conversations yet.
   </div>
  )}
 </div>
 </div>
);
};

export default ConversationList;