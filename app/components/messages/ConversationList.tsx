// app/components/messages/ConversationList.tsx
'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/app/lib/local-db';
import { useUser } from '@/app/context/user-context';
import Image from 'next/image';
import type { LocalDirectMessage, LocalUserProfile } from '@/app/lib/local-db';
import { FiSearch, FiEdit } from 'react-icons/fi';
import '@/app/styles/messages.css';

interface Conversation {
    partner: LocalUserProfile;
    lastMessage: LocalDirectMessage;
}

interface ConversationListProps {
    onSelectConversation: (userId: string) => void;
    onNewMessage: () => void; // --- UPDATED ---
}

const ConversationList = ({ onSelectConversation, onNewMessage }: ConversationListProps) => {
    const { userProfile } = useUser();

    const conversations = useLiveQuery(async () => {
        if (!userProfile) return [];

        const currentUserId = userProfile.user_id;

        const allMessages = await db.social_user_direct_messages
            .where('sending_user_id').equals(currentUserId)
            .or('receiving_user_id').equals(currentUserId)
            .toArray();
        
        const conversationsMap = new Map<string, LocalDirectMessage>();
        const partnerIds = new Set<string>();

        for (const message of allMessages) {
            const partnerId = message.sending_user_id === currentUserId ? message.receiving_user_id : message.sending_user_id;
            partnerIds.add(partnerId);

            const existingLastMessage = conversationsMap.get(partnerId);
            if (!existingLastMessage || new Date(message.created_at) > new Date(existingLastMessage.created_at)) {
                conversationsMap.set(partnerId, message);
            }
        }
        
        if (partnerIds.size === 0) return [];

        const partners = await db.userProfile.where('user_id').anyOf([...partnerIds]).toArray();
        const partnersMap = new Map(partners.map(p => [p.user_id, p]));

        const result: Conversation[] = [];
        for (const [partnerId, lastMessage] of conversationsMap.entries()) {
            const partner = partnersMap.get(partnerId);
            if (partner) {
                result.push({ partner, lastMessage });
            }
        }

        return result.sort((a, b) => new Date(b.lastMessage.created_at).getTime() - new Date(a.lastMessage.created_at).getTime());

    }, [userProfile], []);

    return (
        <div className="flex flex-col h-full mt-[86px]">
            {/* Header */}
            <div className="p-4 border-b border-gray-200">
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

            {/* Conversation List */}
            <div>
                {conversations && conversations.length > 0 ? (
                    conversations.map(({ partner, lastMessage }) => (
                        <div 
                            key={partner.user_id} 
                            onClick={() => onSelectConversation(partner.user_id)}
                            className="conversation-block"
                        >
                            <Image
                                src={partner.profileImage || 'https://xfotoaervolaaiqrhgue.supabase.co/storage/v1/object/public/userImages/userIcon.jpg'}
                                alt={partner.displayName}
                                width={50}
                                height={50}
                                className="rounded-full"
                            />
                            <div className="conversation">
                                <div className="conversation-detail">
                                    <h3 className="username">{partner.displayName}</h3>
                                    <span className="conversation-time">
                                        {new Date(lastMessage.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                </div>
                                <p className="message-preview">
                                    {lastMessage.direct_message}
                                </p>
                            </div>
                        </div>
                    ))
                ) : (
                    <div className="p-[1em] text-center text-gray-500">
                        No conversations yet.
                    </div>
                )}
            </div>
        </div>
    );
};

export default ConversationList;