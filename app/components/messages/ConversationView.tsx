// app/components/messages/ConversationView.tsx
'use client';

import { useState, useEffect, useRef } from 'react';
import { useUser } from '@/app/context/user-context';
import { db, LocalDirectMessage } from '@/app/lib/local-db';
import { useLiveQuery } from 'dexie-react-hooks';
import { createLocalDirectMessage, deleteMessageForMe, deleteMessageForEveryone, syncDeletedMessages, syncLocalDirectMessages } from '@/app/lib/supabase-sync-utils';
import Image from 'next/image';
import { FiSend, FiPaperclip, FiTrash, FiXCircle, FiCheck, FiCheckCircle } from 'react-icons/fi';
import { TfiAngleDoubleDown, TfiMoreAlt } from "react-icons/tfi";
import { BsEmojiSmile } from 'react-icons/bs';
import { RealtimeChannel } from '@supabase/supabase-js';
import '@/app/styles/messages.css';
import { DotLottieReact } from '@lottiefiles/dotlottie-react';
import typingAnimation from '@/public/animations/typing.json';

interface ConversationViewProps {
  conversationId: number;
  partnerId: string;
}

const ReadReceipt = ({ isRead }: { isRead: boolean }) => {
  if (isRead) { return <FiCheckCircle size={16} className="text-blue-400" />; }
  return <FiCheck size={16} className="text-gray-400" />;
};

const ConversationView = ({ conversationId, partnerId }: ConversationViewProps) => {
  const { userProfile, supabase } = useUser();
  const [newMessage, setNewMessage] = useState('');
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<number | null>(null);
  const [isPartnerTyping, setIsPartnerTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isInitialLoad = useRef(true);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);

  const partnerProfile = useLiveQuery(() => 
    db.userProfile.get(partnerId),
    [partnerId]
  );

  const messages = useLiveQuery(async () => {
    if (!userProfile) return [];
    const deletedRecords = await db.social_deleted_messages.where({ user_id: userProfile.user_id }).toArray();
    const deletedMessageIds = new Set(deletedRecords.map(r => r.message_id));
    
    const allMessages = await db.social_user_direct_messages
      .where({ conversation_id: conversationId })
      .sortBy('created_at');

    return allMessages.filter(msg => !deletedMessageIds.has(msg.id!));
  }, [conversationId, userProfile?.user_id]);

  useEffect(() => {
    if (!userProfile || !conversationId) return;
    const userId = userProfile.user_id;
    const channelName = ['chat', userId, partnerId].sort().join('-');
    const channel = supabase.channel(channelName, {
      config: {
        presence: { key: userId },
      }
    });
    channelRef.current = channel;

    channel.on('postgres_changes', { 
      event: '*', 
      schema: 'public', 
      table: 'social_user_direct_messages',
            filter: `conversation_id=eq.${conversationId}`
    }, (payload) => {
      console.log('[ConversationView] Realtime event received:', payload);
            const record = payload.new as any; // Cast to any to handle is_read boolean
      if (payload.eventType === 'INSERT') {
                // --- UPDATED --- Convert boolean to number (1/0)
        const newMessage = { ...record, synced: 1, is_read: record.is_read ? 1 : 0 };
                db.social_user_direct_messages.put(newMessage);
      } else if (payload.eventType === 'UPDATE') {
                // --- UPDATED --- Convert boolean to number (1/0)
                const updatedMessage = { ...record, synced: 1, is_read: record.is_read ? 1 : 0 };
        db.social_user_direct_messages.update(record.id, updatedMessage);
      }
    });

    channel.on('presence', { event: 'sync' }, () => {
      const presenceState = channel.presenceState();
      const partnerPresence = Object.values(presenceState).flat().find((p: any) => p.user_id === partnerId);
      setIsPartnerTyping(partnerPresence?.status === 'typing');
    });

    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await channel.track({ user_id: userId, status: 'online' });
      }
    });

    return () => { supabase.removeChannel(channel); channelRef.current = null; };
  }, [conversationId, partnerId, userProfile, supabase]);

    const scrollToBottom = (behavior: 'smooth' | 'auto' = 'smooth') => {
        messagesEndRef.current?.scrollIntoView({ behavior });
    };

    useEffect(() => {
        const container = scrollContainerRef.current;
        if (!container || !messages || messages.length === 0) return;
        if (isInitialLoad.current) {
            scrollToBottom('auto');
            isInitialLoad.current = false;
        } else {
            const isScrolledToBottom = container.scrollHeight - container.clientHeight <= container.scrollTop + 10;
            const lastMessage = messages[messages.length - 1];
            const isNewMessageFromPartner = lastMessage && lastMessage.sending_user_id === partnerId;
            if (isScrolledToBottom) {
                scrollToBottom('smooth');
            } else if (isNewMessageFromPartner) {
                setShowScrollButton(true);
            }
        }
    }, [messages, partnerId]);

    useEffect(() => {
        isInitialLoad.current = true;
    }, [conversationId]);

    const handleScroll = () => {
        const container = scrollContainerRef.current;
        if (!container) return;
        const isScrolledUp = container.scrollHeight - container.clientHeight > container.scrollTop + 20;
        setShowScrollButton(isScrolledUp);
    };

    useEffect(() => {
        if (!messages || !userProfile) return;
        // --- UPDATED --- This now correctly checks for messages sent by the partner
        const unreadMessageIds = messages
            .filter(msg => msg.sending_user_id === partnerId && msg.is_read === 0)
            .map(msg => msg.id!);

        if (unreadMessageIds.length > 0) {
            db.social_user_direct_messages.where('id').anyOf(unreadMessageIds).modify({ is_read: 1 });
            supabase
                .from('social_user_direct_messages')
                .update({ is_read: true })
                .in('id', unreadMessageIds)
                .then(({ error }) => {
                    if (error) console.error("Failed to mark messages as read on server:", error);
                });
        }
    }, [messages, partnerId, userProfile, supabase]);

    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newMessage.trim() || !userProfile) return;
        try {
            await createLocalDirectMessage({
                conversation_id: conversationId,
                sending_user_id: userProfile.user_id,
                direct_message: newMessage,
            });
            clearTimeout(typingTimeoutRef.current!);
            if (channelRef.current) {
                await channelRef.current.track({ user_id: userProfile.user_id, status: 'online' });
            }
            setNewMessage('');
            scrollToBottom('smooth');
            if (navigator.onLine) {
                syncLocalDirectMessages(supabase);
            }
        } catch (error) {
            console.error("Failed to send message:", error);
        }
    };

    const handleDeleteForMe = (messageId: number) => {
        if (!userProfile) return;
        deleteMessageForMe(messageId, userProfile.user_id);
        if (navigator.onLine) {
            syncDeletedMessages(supabase);
        }
        setOpenMenuId(null);
    };

    const handleDeleteForEveryone = (message: LocalDirectMessage) => {
        deleteMessageForEveryone(supabase, message.id!);
        setOpenMenuId(null);
    };

    const handleTyping = async (e: React.ChangeEvent<HTMLInputElement>) => {
        setNewMessage(e.target.value);
        
        if (!userProfile || !channelRef.current) return;
        const userId = userProfile.user_id;

        if (e.target.value.length > 0) {
            await channelRef.current.track({ user_id: userId, status: 'typing' });
            clearTimeout(typingTimeoutRef.current!);
            typingTimeoutRef.current = setTimeout(async () => {
                await channelRef.current!.track({ user_id: userId, status: 'online' });
            }, 2000);
        } else {
            clearTimeout(typingTimeoutRef.current!);
            await channelRef.current.track({ user_id: userId, status: 'online' });
        }
    };

    if (!partnerProfile) {
        return <p>Loading...</p>;
    }

    return (
        <div className="relative flex flex-col h-full" onClick={() => setOpenMenuId(null)}>
            <div className="flex-shrink-0 flex items-center p-[1em] border-b border-gray-200 bg-gray-50">
                <Image
                    src={partnerProfile.profileImage || '/default-avatar.jpg'}
                    alt={partnerProfile.displayName}
                    width={50}
                    height={50}
                    className="rounded-full"
                />
                <div className="ml-[1em]">
                    <h2 className="font-semibold text-gray-800">{partnerProfile.displayName}</h2>
                    {isPartnerTyping ? (
                        <div className=''>
                            <DotLottieReact src='/animations/typing.json' loop autoplay style={{ width: '40px', height: '20px' }} layout={{ fit: "cover" }}/>
                        </div>
                    ) : (
                        <p className="text-xs text-gray-500">online</p>
                    )}
                </div>
            </div>

            <div className="message-area-container" ref={scrollContainerRef} onScroll={handleScroll}>
                {messages?.map((msg) => {
                    const isSentByUser = msg.sending_user_id === userProfile?.user_id;
                    const isRecent = (new Date().getTime() - new Date(msg.created_at).getTime()) < 3600000;

                    return (
                        <div key={msg.id} className={`flex items-top group ${isSentByUser ? 'justify-end' : 'justify-start'}`}>
                            <div className={`relative pt-[1em] ${isSentByUser ? 'order-1 pr-[16px]' : 'order-2 pl-[16px]'}`}>
                                <button onClick={(e) => { e.stopPropagation(); setOpenMenuId(openMenuId === msg.id ? null : msg.id!) }} className="context-menu-button">
                                    <TfiMoreAlt />
                                </button>
                                {openMenuId === msg.id && (
                                    <div className={`absolute z-20 w-48 bg-white rounded-md shadow-lg ${isSentByUser ? 'right-0' : 'left-0'}`}>
                                        <ul className="py-1 text-sm text-gray-700">
                                            <li>
                                                <a href="#" onClick={(e) => { e.preventDefault(); handleDeleteForMe(msg.id!); }} className="flex items-center px-4 py-2 hover:bg-gray-100">
                                                    <FiXCircle className="mr-2"/> Delete for Me
                                                </a>
                                            </li>
                                            {isSentByUser && isRecent && (
                                                <li>
                                                    <a href="#" onClick={(e) => { e.preventDefault(); handleDeleteForEveryone(msg); }} className="flex items-center px-4 py-2 hover:bg-gray-100 text-red-600">
                                                        <FiTrash className="mr-2"/> Delete for Everyone
                                                    </a>
                                                </li>
                                            )}
                                        </ul>
                                    </div>
                                )}
                            </div>
                            <div className={`message-bubble-${isSentByUser ? 'sender' : 'receiver'}`}>
                                <p>{msg.direct_message}</p>
                                <div className="flex items-center mt-[2px]">
                                    <span className={`text-[0.75em] ${isSentByUser ? 'mr-[8px] self-end' : 'self-start'}`}>
                                        {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                    {isSentByUser && <ReadReceipt isRead={msg.is_read === 1} />}
                                </div>
                            </div>
                        </div>
                    );
                })}
                <div ref={messagesEndRef} />
            </div>
            {showScrollButton && (
                <button 
                    onClick={() => scrollToBottom('smooth')}
                    className="cv-button"
                    aria-label="Scroll to bottom"
                >
                    <TfiAngleDoubleDown size={20} />
                </button>
            )}

            <div className="flex-shrink-0 p-[1em] bg-gray-50 border-t border-gray-200">
                <form onSubmit={handleSendMessage} className="flex items-center">
                    <BsEmojiSmile size={24} className="text-gray-500 cursor-pointer hover:text-gray-700" />
                    <FiPaperclip size={24} className="text-gray-500 ml-[8px] cursor-pointer hover:text-gray-700" />
                    <input
                        type="text"
                        value={newMessage}
                        onChange={handleTyping}
                        placeholder="Type a message..."
                        className="flex-grow ml-[8px] px-[1em] py-[0.5em] bg-gray-200 rounded-full focus:outline-none"
                    />
                    <button type="submit" className="p-2 ml-[8px] rounded-full bg-blue-500 text-white hover:bg-blue-600 focus:outline-none">
                        <FiSend size={20} />
                    </button>
                </form>
            </div>
        </div>
    );
};

export default ConversationView;