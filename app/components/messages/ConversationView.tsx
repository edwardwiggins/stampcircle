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
import { FiUsers, FiSearch } from 'react-icons/fi';
import { BsEmojiSmile } from 'react-icons/bs';
import { RealtimeChannel } from '@supabase/supabase-js';
import '@/app/styles/messages.css';
import { DotLottieReact } from '@lottiefiles/dotlottie-react';
import { FileUploaderRegular, OutputFileEntry, OutputCollectionState } from '@uploadcare/react-uploader';
import '@uploadcare/react-uploader/core.css';
import Reactions from '../Reactions';
import ReactionSummary from './ReactionSummary';

interface ConversationViewProps {
  conversationId: number;
  partnerId: string | null; // Can be null for group chats
  onShowDetails: () => void;
}

const ReplyPreview = ({ messageId }: { messageId: number }) => {
    const originalMessage = useLiveQuery(() => 
        db.social_user_direct_messages.get(messageId), 
        [messageId]
    );

    const author = useLiveQuery(() => 
        originalMessage ? db.userProfile.get(originalMessage.sending_user_id) : undefined,
        [originalMessage]
    );

    const attachments = useLiveQuery(async () => {
        if (!originalMessage) return [];
        // Check both local (unsynced) and synced attachments
        const local = originalMessage.attachments || [];
        const synced = await db.social_message_attachments.where({ message_id: originalMessage.id }).toArray();
        return [...local, ...synced];
    }, [originalMessage]);

    if (!originalMessage || !author) {
        return null; 
    }

    return (
        <div className="message-bubble-reply">
            <p className="reply-author">{author.displayName}</p>
            <div className="flex flex-col gap-2">
                <p className="reply-content">{originalMessage.direct_message || (attachments && attachments.length > 0 ? 'Image(s)' : '')}</p>
                {attachments && attachments.length > 0 && (
                    <div className="flex gap-1 w-full mt-[4px] mb-[2px]">
                        {attachments.map((att, index) => {
                             const url = (att as LocalMessageAttachment)?.file_path || (att as OutputFileEntry)?.cdnUrl;
                             if (!url) return null;
                             return (
                                <Image 
                                    key={(att as any).id || (att as any).uuid || index}
                                    src={`${url}-/preview/60x60/`}
                                    alt="reply attachment"
                                    width={40}
                                    height={40}
                                    className="rounded object-cover"
                                />
                             )
                        })}
                    </div>
                )}
            </div>
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

const ConversationView = ({ conversationId, partnerId, onShowDetails }: ConversationViewProps) => {
    const { userProfile, supabase } = useUser();
    const [newMessage, setNewMessage] = useState('');
    const [showScrollButton, setShowScrollButton] = useState(false);
    const [openMenuId, setOpenMenuId] = useState<number | null>(null);
    const [typingUsers, setTypingUsers] = useState<string[]>([]);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const isInitialLoad = useRef(true);
    const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const channelRef = useRef<RealtimeChannel | null>(null);
    const [filesToUpload, setFilesToUpload] = useState<OutputFileEntry[]>([]);
    const [showUploader, setShowUploader] = useState(false);
    const [replyingTo, setReplyingTo] = useState<LocalDirectMessage | null>(null);
    const conversation = useLiveQuery(() => 
        db.social_conversations.get(conversationId),
        [conversationId]
    );
    const [isSearchVisible, setIsSearchVisible] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [editingMessage, setEditingMessage] = useState<LocalDirectMessage | null>(null);
    const [editedContent, setEditedContent] = useState('');

    const participants = useLiveQuery(() =>
        db.social_conversation_participants.where({ conversation_id: conversationId }).toArray(),
        [conversationId]
    );

   const partnerProfile = useLiveQuery(() => 
      partnerId ? db.userProfile.get(partnerId) : undefined,
      [partnerId]
   );

    const participantProfiles = useLiveQuery(async () => {
        if (!participants) return new Map<string, LocalUserProfile>();
        const userIds = participants.map(p => p.user_id);
        const profiles = await db.userProfile.where('user_id').anyOf(userIds).toArray();
        return new Map(profiles.map(p => [p.user_id, p]));
    }, [participants]);

   const messages = useLiveQuery(async () => {
        if (!userProfile) return [];
        const deletedRecords = await db.social_deleted_messages.where({ user_id: userProfile.user_id }).toArray();
        const deletedMessageIds = new Set(deletedRecords.map(r => r.message_id));
        const allMessages = await db.social_user_direct_messages.where({ conversation_id: conversationId }).sortBy('created_at');
        return allMessages.filter(msg => !deletedMessageIds.has(msg.id!));
   }, [conversationId, userProfile?.user_id]);

  useEffect(() => {
        if (!userProfile || !conversationId) return;

        const userId = userProfile.user_id;
        const channelName = `conversation-${conversationId}`; // Simpler channel name
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

      // --- NEW --- Listener for conversation detail updates (e.g., group name change)
      channel.on('postgres_changes', {
          event: 'UPDATE',
          schema: 'public',
          table: 'social_conversations',
          filter: `id=eq.${conversationId}`
      }, (payload) => {
          console.log('Conversation details updated:', payload.new);
          db.social_conversations.update(conversationId, payload.new);
      });

    channel.on('presence', { event: 'sync' }, () => {
            const presenceState = channel.presenceState();
            const currentlyTyping = [];

            for (const key in presenceState) {
                const presences = presenceState[key] as unknown as { user_id: string, status: string }[];
                const typingPresence = presences.find(p => p.status === 'typing' && p.user_id !== userId);
                if (typingPresence) {
                    const profile = participantProfiles?.get(typingPresence.user_id);
                    if (profile) {
                        currentlyTyping.push(profile.firstName || profile.displayName);
                    }
                }
            }
            setTypingUsers(currentlyTyping);
        });

    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await channel.track({ user_id: userId, status: 'online' });
      }
    });

    return () => { supabase.removeChannel(channel); channelRef.current = null; };
    }, [conversationId, userProfile, supabase, participantProfiles]); // Added participantProfiles dependency

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

    useEffect(() => {
        // --- NEW --- When we start editing, close the context menu
        if (editingMessage) {
            setOpenMenuId(null);
        }
    }, [editingMessage]);

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
// --- NEW --- Handlers for the edit functionality
    const handleStartEdit = (message: LocalDirectMessage) => {
        setEditingMessage(message);
        setEditedContent(message.direct_message);
        setOpenMenuId(null);
    };

    const handleCancelEdit = () => {
        setEditingMessage(null);
        setEditedContent('');
    };

    const handleSaveEdit = async () => {
        if (!editingMessage || editedContent.trim() === '') return;

        const { error } = await supabase.rpc('edit_message', {
            p_message_id: editingMessage.id!,
            p_new_content: editedContent
        });

        if (error) {
            console.error("Failed to edit message:", error);
            // Optionally show a toast error to the user
        } else {
            // Update local DB for instant UI change
            await db.social_user_direct_messages.update(editingMessage.id!, {
                direct_message: editedContent,
                last_edited_at: new Date().toISOString()
            });
        }
        handleCancelEdit(); // Reset editing state
    };

    const filteredMessages = messages?.filter(msg => {
        if (!searchTerm.trim()) return true;
        return msg.direct_message.toLowerCase().includes(searchTerm.toLowerCase());
    });

    if (!conversation || (conversation.is_group === false && !partnerProfile)) {
        return <p>Loading conversation...</p>;
    }

    const isGroup = conversation.is_group;
    const headerName = isGroup ? conversation.group_name : partnerProfile?.displayName;
    const headerStatus = isGroup ? `${participants?.length || 0} members` : (typingUsers.length > 0 ? 'typing...' : 'online');
    const headerAvatar = isGroup ? null : (partnerProfile?.profileImage || '/images/default-avatar.jpg');

    const GroupTypingIndicator = () => {
        if (typingUsers.length === 0) {
            return <p className="text-xs text-gray-500">{headerStatus}</p>;
        }
        if (typingUsers.length === 1) {
            return <p className="text-xs text-blue-500 italic">{typingUsers[0]} is typing...</p>;
        }
        if (typingUsers.length === 2) {
            return <p className="text-xs text-blue-500 italic">{typingUsers.join(' and ')} are typing...</p>;
        }
        return <p className="text-xs text-blue-500 italic">Several people are typing...</p>;
    };

    return (
        <div className="relative flex flex-col h-full" onClick={() => setOpenMenuId(null)}>
            <div className={`flex-shrink-0 flex items-center p-[1em] border-b border-gray-200 bg-gray-50 ${isGroup ? 'cursor-pointer hover:bg-gray-100' : ''}`}>
                {isSearchVisible ? (
                    <div className="flex items-center w-full">
                        <FiSearch className="text-gray-400" />
                        <input
                            type="text"
                            placeholder="Search in conversation..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="flex-grow mx-2 px-2 py-1 bg-gray-200 rounded-md focus:outline-none"
                            autoFocus
                        />
                        <button onClick={() => { setIsSearchVisible(false); setSearchTerm(''); }} className="p-2">
                            <FiX />
                        </button>
                    </div>
                ) : (
                    <>
                        <div 
                            className={`flex items-center ${isGroup ? 'cursor-pointer' : ''}`}
                            onClick={isGroup ? onShowDetails : undefined}
                        >
                            {isGroup ? <div className="relative w-[50px] h-[50px] flex-shrink-0 bg-gray-200 rounded-full flex items-center justify-center"><FiUsers className="text-gray-500" size={24} /></div> : <Image src={headerAvatar!} alt={headerName || 'Chat'} width={50} height={50} className="rounded-full" />}
                            <div className="ml-[1em]">
                                <h2 className="font-semibold text-gray-800">{headerName}</h2>
                                {isGroup ? <GroupTypingIndicator /> : (typingUsers.length > 0 ? <div style={{ width: '40px', height: '20px' }}><Lottie animationData={typingAnimation} loop={true} /></div> : <p className="text-xs text-gray-500">{headerStatus}</p>)}
                            </div>
                        </div>
                        <button onClick={() => setIsSearchVisible(true)} className="p-2 rounded-full hover:bg-gray-200">
                            <FiSearch size={20} />
                        </button>
                    </>
                )}
            </div>


            <div className="message-area-container" ref={scrollContainerRef} onScroll={handleScroll}>
                {filteredMessages?.map((msg) => {
                    const isSentByUser = msg.sending_user_id === userProfile?.user_id;
                    const isRecent = (new Date().getTime() - new Date(msg.created_at).getTime()) < 3600000;
                    const senderProfile = participantProfiles?.get(msg.sending_user_id);
                    // --- NEW --- Check if the current message is being edited
                    if (editingMessage && editingMessage.id === msg.id) {
                        return (
                            <div key={msg.id} className="p-2">
                                <textarea
                                    value={editedContent}
                                    onChange={(e) => setEditedContent(e.target.value)}
                                    className="w-full p-2 border rounded-md"
                                    rows={3}
                                    autoFocus
                                />
                                <div className="flex justify-end gap-2 mt-2">
                                    <button onClick={handleCancelEdit} className="text-sm font-semibold text-gray-600 px-3 py-1">Cancel</button>
                                    <button onClick={handleSaveEdit} className="text-sm font-semibold text-white bg-blue-500 px-3 py-1 rounded-md">Save</button>
                                </div>
                            </div>
                        );
                    }
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
                                            {isSentByUser && isRecent && msg.direct_message && (
                                                <li><a href="#" onClick={(e) => { e.preventDefault(); handleStartEdit(msg); }} className="flex items-center px-4 py-2 hover:bg-gray-100"><FiEdit3 className="mr-2"/> Edit Message</a></li>
                                            )}
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
                                    {isGroup && !isSentByUser && senderProfile && (
                                        <p className="group-author">
                                            {senderProfile.displayName}
                                        </p>
                                    )}
                                {msg.reply_to_message_id && <ReplyPreview messageId={msg.reply_to_message_id} />}
                                {msg.direct_message && <p>{msg.direct_message}</p>}
                                <MessageAttachments message={msg} />
                                <div className="flex items-center mt-[2px]">
                                    <span className={`text-[0.75em] ${isSentByUser ? 'mr-[8px] self-end' : 'self-start'}`}>
                                        {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        {msg.last_edited_at && <i className="ml-1 opacity-70">(edited)</i>}
                                    </span>
                                    {isSentByUser && <ReadReceipt isRead={msg.is_read === 1} />}
                                </div>
                                <div className={`absolute flex text-[0.8em] ${isSentByUser ? '-bottom-[20px] right-[16px]' : '-bottom-[20px] left-[8px]'}`}>
                                    <ReactionSummary messageId={msg.id!} />
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
                            <p className="reply-content">{replyingTo.direct_message || '[Attachment]'}</p>
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