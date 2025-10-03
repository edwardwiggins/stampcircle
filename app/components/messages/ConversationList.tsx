// app/components/messages/ConversationList.tsx
'use client';

import { useState } from 'react'; // --- UPDATED ---
import { useUser } from '@/app/context/user-context';
import { db } from '@/app/lib/local-db';
import type { LocalDirectMessage, LocalUserProfile, LocalConversation } from '@/app/lib/local-db';
import { useLiveQuery } from 'dexie-react-hooks';
import Image from 'next/image';
import { FiSearch, FiEdit, FiUsers } from 'react-icons/fi';
import '@/app/styles/messages.css';

interface EnrichedConversation {
    conversation: LocalConversation;
    partner: LocalUserProfile | null;
    lastMessage: LocalDirectMessage | null;
    lastMessageSender: LocalUserProfile | null;
    unreadCount: number;
}

interface ConversationListProps {
    onSelectConversation: (conversationId: number, partnerId: string | null) => void;
    onNewMessage: () => void;
}

const ConversationList = ({ onSelectConversation, onNewMessage }: ConversationListProps) => {
    const { userProfile } = useUser();
    // --- NEW: State to hold the search term ---
    const [searchTerm, setSearchTerm] = useState('');

    const conversations = useLiveQuery(async () => {
        if (!userProfile) return undefined;
        const currentUserId = userProfile.user_id;

        const [
            userParticipantRecords, 
            allMessages, 
            allProfiles
        ] = await Promise.all([
            db.social_conversation_participants.where({ user_id: currentUserId }).toArray(),
            db.social_user_direct_messages.toArray(),
            db.userProfile.toArray()
        ]);
        
        const conversationIds = userParticipantRecords.map(p => p.conversation_id);
        if (conversationIds.length === 0) return [];
        
        const [convos, allParticipantsInMyConvos] = await Promise.all([
            db.social_conversations.where('id').anyOf(conversationIds).toArray(),
            db.social_conversation_participants.where('conversation_id').anyOf(conversationIds).toArray(),
        ]);
        
        const profilesMap = new Map(allProfiles.map(p => [p.user_id, p]));
        const messagesByConvo = new Map<number, LocalDirectMessage[]>();
        for (const msg of allMessages) {
            if(conversationIds.includes(msg.conversation_id)) {
                if (!messagesByConvo.has(msg.conversation_id)) messagesByConvo.set(msg.conversation_id, []);
                messagesByConvo.get(msg.conversation_id)!.push(msg);
            }
        }

        const enrichedConversations: EnrichedConversation[] = convos.map(convo => {
            const participants = allParticipantsInMyConvos.filter(p => p.conversation_id === convo.id);
            const partnerRecord = participants.find(p => p.user_id !== currentUserId);
            const partner = (convo.is_group || !partnerRecord) ? null : profilesMap.get(partnerRecord.user_id) || null;

          const convoMessages = messagesByConvo.get(convo.id) || [];
          convoMessages.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
          const lastMessage = convoMessages[0] || null;
            const lastMessageSender = lastMessage ? profilesMap.get(lastMessage.sending_user_id) : null;
          const unreadCount = convoMessages.filter(msg => msg.is_read === 0 && msg.sending_user_id !== currentUserId).length;

          if (!convo.is_group && !partner) return null;

          return { conversation: convo, partner, lastMessage, lastMessageSender, unreadCount };
      }).filter((c): c is EnrichedConversation => c !== null);

      return enrichedConversations.sort((a, b) => 
          new Date(b.lastMessage?.created_at || b.conversation.last_message_at).getTime() - 
          new Date(a.lastMessage?.created_at || a.conversation.last_message_at).getTime()
      );

    }, [userProfile]);

    // --- NEW: Filter conversations based on the search term ---
    const filteredConversations = conversations?.filter(convo => {
        if (!searchTerm.trim()) return true;
        const lowerCaseSearch = searchTerm.toLowerCase();

        const nameToSearch = convo.conversation.is_group 
            ? convo.conversation.group_name?.toLowerCase() 
            : convo.partner?.displayName.toLowerCase();
        
        const usernameToSearch = convo.partner?.username.toLowerCase();
        const lastMessageToSearch = convo.lastMessage?.direct_message.toLowerCase();

        return (
            nameToSearch?.includes(lowerCaseSearch) ||
            (usernameToSearch && usernameToSearch.includes(lowerCaseSearch)) ||
            lastMessageToSearch?.includes(lowerCaseSearch)
        );
    });

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
                    {/* --- UPDATED: Connect input to state --- */}
                    <input 
                        type="text" 
                        placeholder="Search chats..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                </div>
            </div>

            <div className="flex-grow overflow-y-auto">
                {conversations === undefined ? (
                    <div className="p-[1em] text-center text-gray-500">Loading chats...</div>
                ) : filteredConversations && filteredConversations.length > 0 ? (
                    // --- UPDATED: Render the filtered list ---
                    filteredConversations.map(({ conversation, partner, lastMessage, lastMessageSender, unreadCount }) => {
                        const isGroup = conversation.is_group;
                        const displayName = isGroup ? conversation.group_name : partner?.displayName;
                        const avatar = isGroup ? (
                            <div className="relative w-[50px] h-[50px] flex-shrink-0 bg-gray-200 rounded-full flex items-center justify-center">
                                <FiUsers className="text-gray-500" size={24} />
                            </div>
                        ) : (
                            <Image src={partner?.profileImage || '/images/default-avatar.jpg'} alt={displayName || 'Chat'} width={50} height={50} className="rounded-full flex-shrink-0" />
                        );

                        let lastMessagePrefix = '';
                        if (lastMessage) {
                            if (lastMessage.sending_user_id === userProfile?.user_id) {
                                lastMessagePrefix = 'You: ';
                            } else if (isGroup && lastMessageSender) {
                                lastMessagePrefix = `${lastMessageSender.firstName}: `;
                            }
                        }
                        const lastMessageText = lastMessage?.direct_message || '...';
                        
                        return (
                            <div 
                                key={conversation.id} 
                                onClick={() => onSelectConversation(conversation.id, partner?.user_id || null)}
                                className="conversation-block"
                            >
                                {avatar}
                                <div className="conversation">
                                    <div className="conversation-detail">
                                        <h3 className="username">{displayName}</h3>
                                        {lastMessage && (
                                            <span className="conversation-time">
                                                {new Date(lastMessage.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <p className="message-preview">
                                            <span className="font-semibold">{lastMessagePrefix}</span>{lastMessageText}
                                        </p>
                                        {unreadCount > 0 && (
                                            <span className="ml-2 bg-red-500 text-white text-xs w-5 h-5 flex items-center justify-center rounded-full">
                                                {unreadCount}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })
                ) : (
                    <div className="p-[1em] text-center text-gray-500">
                        {conversations ? 'No conversations yet.' : ''}
                    </div>
                )}
            </div>
        </div>
    );
};

export default ConversationList;