// app/components/messages/ConversationView.tsx
'use client';

import { useState, useEffect, useRef } from 'react';
import { useUser } from '@/app/context/user-context';
import { db, LocalDirectMessage } from '@/app/lib/local-db';
import { useLiveQuery } from 'dexie-react-hooks';
import { createLocalDirectMessage, deleteMessageForMe, deleteMessageForEveryone, syncDeletedMessages, syncLocalDirectMessages } from '@/app/lib/supabase-sync-utils';
import Image from 'next/image';
import { FiSend, FiPaperclip, FiTrash, FiXCircle, FiCheck, FiCheckCircle, FiEdit3, FiX } from 'react-icons/fi';
import { TfiAngleDoubleDown, TfiMoreAlt } from "react-icons/tfi";
import { BsEmojiSmile } from 'react-icons/bs';
import { RealtimeChannel } from '@supabase/supabase-js';
import '@/app/styles/messages.css';
import { DotLottieReact } from '@lottiefiles/dotlottie-react';
import { FileUploaderRegular, OutputFileEntry, OutputCollectionState } from '@uploadcare/react-uploader';
import '@uploadcare/react-uploader/core.css';
import Reactions from '../Reactions';

interface ConversationViewProps {
  conversationId: number;
  partnerId: string;
}

// --- NEW --- Component to display the quoted reply message
const ReplyPreview = ({ messageId }: { messageId: number }) => {
    const originalMessage = useLiveQuery(() => 
        db.social_user_direct_messages.get(messageId), 
        [messageId]
    );

    const author = useLiveQuery(() => 
        originalMessage ? db.userProfile.get(originalMessage.sending_user_id) : undefined,
        [originalMessage]
    );

    if (!originalMessage || !author) {
        // This handles cases where the original message was deleted, per our design decision
        return null; 
    }

    return (
        <div className="message-bubble-reply">
            <p className="reply-author">{author.displayName}</p>
            <p className="reply-content">{originalMessage.direct_message}</p>
        </div>
    );
};

const ReadReceipt = ({ isRead }: { isRead: boolean }) => {
  if (isRead) { return <FiCheckCircle size={16} className="text-blue-400" />; }
  return <FiCheck size={16} className="text-gray-400" />;
};

const MessageAttachments = ({ message }: { message: LocalDirectMessage }) => {
    // For newly sent messages, attachments are stored directly on the message object
    const localAttachments = message.attachments || [];
    
    // For synced messages, we query the attachments table
    const syncedAttachments = useLiveQuery(() => 
        message.id > 0 ? db.social_message_attachments.where({ message_id: message.id }).toArray() : [],
        [message.id]
    ) || [];

    const allAttachments = [...localAttachments, ...syncedAttachments];

    if (allAttachments.length === 0) return null;

    return (
        <div className="mt-2 grid grid-cols-2 gap-2">
            {allAttachments.map((att, index) => {
                const url = (att as LocalMessageAttachment).file_path || (att as OutputFileEntry).cdnUrl;
                if (!url) return null;
                
                return (
                    <div key={(att as any).id || (att as any).uuid || index} className="relative">
                        <Image 
                            src={`${url}-/preview/200x200/`}
                            alt={'attachment'}
                            width={200}
                            height={200}
                            className="rounded-lg object-cover"
                        />
                    </div>
                );
            })}
        </div>
    );
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
  const [filesToUpload, setFilesToUpload] = useState<OutputFileEntry[]>([]);
  const [showUploader, setShowUploader] = useState(false);
  const [replyingTo, setReplyingTo] = useState<LocalDirectMessage | null>(null);

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
      }, async (payload) => { // --- UPDATED --- Made the function async
          const record = payload.new as any;
          if (payload.eventType === 'INSERT') {
              const newMessage = { ...record, synced: 1, is_read: record.is_read ? 1 : 0 };
              await db.social_user_direct_messages.put(newMessage);
              
              // --- NEW --- After receiving a message, check for and fetch its attachments
              const { data: attachments, error } = await supabase
                .from('social_message_attachments')
                .select('*')
                .eq('message_id', newMessage.id);

              if (error) console.error("Failed to fetch attachments for new message:", error);
              if (attachments && attachments.length > 0) {
                await db.social_message_attachments.bulkPut(attachments);
              }

          } else if (payload.eventType === 'UPDATE') {
              const updatedMessage = { ...record, synced: 1, is_read: record.is_read ? 1 : 0 };
              await db.social_user_direct_messages.update(record.id, updatedMessage);
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
        if ((!newMessage.trim() && filesToUpload.length === 0) || !userProfile) return;
        
        try {
            await createLocalDirectMessage({
                conversation_id: conversationId,
                sending_user_id: userProfile.user_id,
                direct_message: newMessage,
                attachments: filesToUpload, // Pass the files
                reply_to_message_id: replyingTo ? replyingTo.id : null,
            });
            clearTimeout(typingTimeoutRef.current!);
            if (channelRef.current) {
                await channelRef.current.track({ user_id: userProfile.user_id, status: 'online' });
            }
            setNewMessage('');
            setFilesToUpload([]);
            setShowUploader(false);
            setReplyingTo(null);
            scrollToBottom('smooth');
            if (navigator.onLine) {
                syncLocalDirectMessages(supabase);
            }
        } catch (error) {
            console.error("Failed to send message:", error);
        }
    };

    // --- NEW ---
    const handleSetReply = (message: LocalDirectMessage) => {
        setReplyingTo(message);
        setOpenMenuId(null);
    };

    const handleUploadChange = (data: OutputCollectionState) => {
        setFilesToUpload(data.allEntries.filter(f => f.status === 'success'));
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
                                                <a href="#" onClick={(e) => { e.preventDefault(); handleSetReply(msg); }} className="flex items-center px-4 py-2 hover:bg-gray-100">
                                                    <FiEdit3 className="mr-2"/> Reply
                                                </a>
                                            </li>
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
                            <div className={`message-bubble-${isSentByUser ? 'sender' : 'receiver'} relative`}>
                                {msg.reply_to_message_id && <ReplyPreview messageId={msg.reply_to_message_id} />}
                                {msg.direct_message && <p>{msg.direct_message}</p>}
                                <MessageAttachments message={msg} />
                                <div className="flex items-center mt-[2px]">
                                    <span className={`text-[0.75em] ${isSentByUser ? 'mr-[8px] self-end' : 'self-start'}`}>
                                        {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                    {isSentByUser && <ReadReceipt isRead={msg.is_read === 1} />}
                                </div>
                                {/* --- NEW --- Add the Reactions component */}
                                <div className={`absolute text-sm ${isSentByUser ? '-bottom-[22px] right-[16px]' : '-bottom-[22px] left-[8px]'}`}>
                                    <Reactions 
                                        entityId={msg.id!} 
                                        entityType="direct_message" 
                                        userProfile={userProfile} 
                                        displayStyle="text"
                                    />
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
                {replyingTo && (
                    <div className="reply-preview-input">
                        <div className="reply-preview-content">
                            <p className="reply-author">Replying to {replyingTo.sending_user_id === userProfile?.user_id ? 'yourself' : partnerProfile?.displayName}</p>
                            <p className="reply-content">{replyingTo.direct_message}</p>
                        </div>
                        <button onClick={() => setReplyingTo(null)} className="p-2">
                            <FiX />
                        </button>
                    </div>
                )}                
                {showUploader && (
                    <div className="p-2 border-b">
                        <FileUploaderRegular
                            pubkey={process.env.NEXT_PUBLIC_UPLOADCARE_PUBLIC_KEY || ''}
                            multiple
                            imgOnly
                            sourceList='local, url, camera, gdrive'
                            onChange={handleUploadChange}
                            classNameUploader="uc-light"
                        />
                    </div>
                )}
                {filesToUpload.length > 0 && (
                    <div className="p-2 border-b flex gap-2">
                        {filesToUpload.map(file => (
                            <div key={file.uuid} className="relative">
                                <Image src={`${file.cdnUrl}-/preview/80x80/`} width={60} height={60} alt="preview" className="rounded"/>
                            </div>
                        ))}
                    </div>
                )}
                <form onSubmit={handleSendMessage} className="flex items-center">
                    <BsEmojiSmile size={24} className="text-gray-500 cursor-pointer hover:text-gray-700" />
                    <button type="button" onClick={() => setShowUploader(!showUploader)}>
                        <FiPaperclip size={24} className="text-gray-500 ml-[8px] cursor-pointer hover:text-gray-700" />
                    </button>
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