// app/components/messages/ConversationView.tsx
'use client';

import { useState, useEffect, useRef } from 'react';
import { useUser } from '@/app/context/user-context';
import { db } from '@/app/lib/local-db';
import { useLiveQuery } from 'dexie-react-hooks';
import { createLocalDirectMessage } from '@/app/lib/supabase-sync-utils';
import Image from 'next/image';
import { FiSend, FiPaperclip } from 'react-icons/fi';
import { BsEmojiSmile } from 'react-icons/bs';

interface ConversationViewProps {
    partnerId: string;
}

const ConversationView = ({ partnerId }: ConversationViewProps) => {
    const { userProfile } = useUser();
    const [newMessage, setNewMessage] = useState('');
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Fetch the profile of the person we're talking to
    const partnerProfile = useLiveQuery(() => 
        db.userProfile.get(partnerId),
        [partnerId]
    );

    // Fetch the message history between the current user and the partner
    const messages = useLiveQuery(async () => {
        if (!userProfile) return [];
        return db.social_user_direct_messages
            .where('[sending_user_id+receiving_user_id]')
            .anyOf([
                [userProfile.user_id, partnerId],
                [partnerId, userProfile.user_id]
            ])
            .sortBy('created_at');
    }, [userProfile, partnerId], []);

    // Effect to scroll to the bottom of the chat when new messages appear
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);
    
    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newMessage.trim() || !userProfile) return;

        try {
            await createLocalDirectMessage({
                sending_user_id: userProfile.user_id,
                receiving_user_id: partnerId,
                direct_message: newMessage,
            });
            setNewMessage(''); // Clear the input field
        } catch (error) {
            console.error("Failed to send message:", error);
            // Optionally, show a toast notification for the error
        }
    };

    if (!partnerProfile) {
        return <div className="flex-grow flex items-center justify-center"><p>Loading...</p></div>;
    }

    return (
        <div>
            {/* Header */}
            <div className="conversationview-header">
                <Image
                    src={partnerProfile.profileImage || 'https://xfotoaervolaaiqrhgue.supabase.co/storage/v1/object/public/userImages/userIcon.jpg'}
                    alt={partnerProfile.displayName}
                    width={50}
                    height={50}
                    className="rounded-full"
                />
                <div className="header-conversation-detail">
                    <h2 className="font-semibold text-gray-800">{partnerProfile.displayName}</h2>
                    {/* Placeholder for online status */}
                    <p className="text-xs text-gray-500">online</p>
                </div>
            </div>

            {/* Message Area */}
            <div className="flex-grow p-4 overflow-y-auto bg-gray-100">
                {messages?.map((msg) => {
                    const isSentByUser = msg.sending_user_id === userProfile?.user_id;
                    return (
                        <div key={msg.id} className={`flex ${isSentByUser ? 'justify-end' : 'justify-start'} mb-4`}>
                            <div className={`max-w-md p-3 rounded-lg ${isSentByUser ? 'bg-blue-500 text-white' : 'bg-white text-gray-800'}`}>
                                <p>{msg.direct_message}</p>
                                <span className={`text-xs mt-1 block ${isSentByUser ? 'text-blue-100' : 'text-gray-400'} text-right`}>
                                    {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </span>
                            </div>
                        </div>
                    );
                })}
                <div ref={messagesEndRef} />
            </div>

            {/* Input Footer */}
            <div className="p-4 bg-gray-50 border-t border-gray-200">
                <form onSubmit={handleSendMessage} className="flex items-center">
                    {/* Placeholder icons */}
                    <BsEmojiSmile size={24} className="text-gray-500 cursor-pointer hover:text-gray-700" />
                    <FiPaperclip size={24} className="text-gray-500 ml-4 cursor-pointer hover:text-gray-700" />

                    <input
                        type="text"
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        placeholder="Type a message..."
                        className="flex-grow mx-4 px-4 py-2 bg-gray-200 rounded-full focus:outline-none"
                    />
                    <button type="submit" className="p-2 rounded-full bg-blue-500 text-white hover:bg-blue-600 focus:outline-none">
                        <FiSend size={20} />
                    </button>
                </form>
            </div>
        </div>
    );
};

export default ConversationView;