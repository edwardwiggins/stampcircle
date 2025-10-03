// app/components/messages/GroupDetails.tsx
'use client';

import { useState, useEffect } from 'react';
import { useUser } from '@/app/context/user-context';
import { db, LocalUserProfile } from '@/app/lib/local-db';
import { useLiveQuery } from 'dexie-react-hooks';
import Image from 'next/image';
import { FiArrowLeft, FiLogOut, FiUserX, FiUserPlus, FiEdit2, FiCheck, FiTrash2, FiAlertTriangle } from 'react-icons/fi';
import toast from 'react-hot-toast';

interface GroupDetailsProps {
  conversationId: number;
  onBack: () => void;
    onAddParticipants: () => void;
}

const GroupDetails = ({ conversationId, onBack, onAddParticipants }: GroupDetailsProps) => {
    const { userProfile, supabase } = useUser();
    const [isEditing, setIsEditing] = useState(false);
    const [editedName, setEditedName] = useState('');

    const conversation = useLiveQuery(() => 
        db.social_conversations.get(conversationId),
        [conversationId]
    );

    useEffect(() => {
        if (conversation) {
            setEditedName(conversation.group_name || '');
        }
    }, [conversation]);

    const participants = useLiveQuery(async () => {
        if (!conversation) return [];
        const participantRecords = await db.social_conversation_participants
            .where({ conversation_id: conversation.id })
            .toArray();
        const userIds = participantRecords.map(p => p.user_id);
        return await db.userProfile.where('user_id').anyOf(userIds).toArray();
    }, [conversation]);

    if (!userProfile || !conversation || !participants) {
        return <div>Loading...</div>;
    }

    const isOwner = userProfile.user_id === conversation.created_by;

    const handleLeaveGroup = async () => {
        if (window.confirm("Are you sure you want to leave this group?")) {
            const recordToDelete = await db.social_conversation_participants
                .where({ conversation_id: conversationId, user_id: userProfile.user_id })
                .first();
            
            if (recordToDelete) {
                await db.social_conversation_participants.delete(recordToDelete.id);
                // Also call the RLS-protected delete on the server
                await supabase.from('social_conversation_participants').delete().eq('id', recordToDelete.id);
            }
            onBack();
        }
    };

    const handleRemoveUser = async (userId: string) => {
        if (window.confirm("Are you sure you want to remove this user from the group?")) {
            const { error } = await supabase.rpc('remove_group_participant', {
                p_conversation_id: conversationId,
                p_user_to_remove_id: userId
            });

            if (error) {
                console.error("Failed to remove user:", error);
            } else {
                const recordToDelete = await db.social_conversation_participants
                    .where({ conversation_id: conversationId, user_id: userId })
                    .first();
                if (recordToDelete) {
                    await db.social_conversation_participants.delete(recordToDelete.id);
                }
            }
        }
    };

    const handleSaveName = async () => {
        if (editedName.trim() && editedName !== conversation.group_name) {
            // Update Supabase first
            const { error } = await supabase
                .from('social_conversations')
                .update({ group_name: editedName })
                .eq('id', conversationId);

            if (error) {
                console.error("Failed to update group name:", error);
            } else {
                await db.social_conversations.update(conversationId, { group_name: editedName });
            }
        }
        setIsEditing(false);
    };

    const handleDeleteGroup = async () => {
        if (window.confirm("Are you sure you want to permanently delete this group for everyone? This action cannot be undone.")) {
            const { error } = await supabase.rpc('delete_group_chat', {
                p_conversation_id: conversationId
            });

            if (error) {
                console.error("Failed to delete group:", error);
            } else {
                // Clean up local DB. Dexie's cascading deletes are not automatic.
                await db.transaction('rw', db.social_conversations, db.social_conversation_participants, db.social_user_direct_messages, async () => {
                    await db.social_conversation_participants.where({ conversation_id: conversationId }).delete();
                    await db.social_user_direct_messages.where({ conversation_id: conversationId }).delete();
                    await db.social_conversations.delete(conversationId);
                });
                onBack(); // Navigate away from the now-deleted chat
            }
        }
    };

    const handleReportGroup = async () => {
        const reason = prompt("Please provide a reason for reporting this group (optional):");
        if (reason === null) return; // User cancelled the prompt

        const { error } = await supabase.rpc('report_group_chat', {
            p_conversation_id: conversationId,
            p_reason: reason
        });

        if (error) {
            console.error("Failed to report group:", error);
            toast.error(error.message);
        } else {
            toast.success("Group has been reported. Thank you.");
        }
    };

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-gray-200 flex-shrink-0">
        <div className="flex items-center mb-4">
          <button onClick={onBack} className="p-2 rounded-full hover:bg-gray-200 mr-2">
            <FiArrowLeft size={20} />
          </button>
          {/* --- UPDATED --- Logic for displaying/editing the group name */}
                    {isEditing ? (
                        <div className="flex items-center w-full">
                            <input
                                type="text"
                                value={editedName}
                                onChange={(e) => setEditedName(e.target.value)}
                                className="text-xl font-bold text-gray-800 bg-gray-100 rounded-md px-2 py-1 flex-grow"
                                autoFocus
                            />
                            <button onClick={handleSaveName} className="p-2 rounded-full hover:bg-green-100 text-green-500 ml-2">
                                <FiCheck size={20} />
                            </button>
                        </div>
                    ) : (
                        <div className="flex items-center">
                <h1 className="text-xl font-bold text-gray-800">{conversation.group_name || 'Group Details'}</h1>
                            {isOwner && (
                                <button onClick={() => setIsEditing(true)} className="p-2 rounded-full hover:bg-gray-200 ml-2">
                                    <FiEdit2 size={16} className="text-gray-500"/>
                                </button>
                            )}
                        </div>
                    )}
        </div>
                <p className="text-sm text-gray-500 ml-10">{participants.length} Members</p>
      </div>

      <div className="flex-grow overflow-y-auto">
                {isOwner && (
                    <button onClick={onAddParticipants} className="flex items-center w-full p-4 text-blue-500 hover:bg-gray-100 font-semibold">
                        <FiUserPlus className="mr-3" size={20} />
                        Add Participants
                    </button>
                )}
        <ul>
          {participants.map(user => (
            <li key={user.user_id} className="flex items-center justify-between p-4 hover:bg-gray-100">
              <div className="flex items-center">
                                <Image
                    src={user.profileImage || '/default-avatar.jpg'}
                    alt={user.displayName}
                    width={40}
                    height={40}
                    className="rounded-full"
                  />
                  <div className="ml-3">
                    <h3 className="font-semibold text-gray-800">{user.displayName}</h3>
                                    {user.user_id === conversation.created_by && <p className="text-xs text-gray-500">Creator</p>}
                  </div>
                            </div>
                            {isOwner && user.user_id !== userProfile.user_id && (
                                <button onClick={() => handleRemoveUser(user.user_id)} className="p-2 rounded-full hover:bg-red-100 text-red-500">
                                    <FiUserX size={20} />
                                </button>
                            )}
            </li>
          ))}
        </ul>
      </div>

            {/* --- UPDATED --- Leave Group button is now only visible to non-owners */}
            <div className="flex-shrink-0 p-4 border-t">
                {isOwner ? (
                    <button 
                        onClick={handleDeleteGroup}
                        className="w-full flex items-center justify-center p-2 text-red-500 hover:bg-red-100 font-semibold rounded-lg"
                    >
                        <FiTrash2 className="mr-2" />
                        Delete Group
                    </button>
                ) : (
                    <>
                    <button 
                        onClick={handleLeaveGroup}
                        className="w-full flex items-center justify-center p-2 text-red-500 hover:bg-red-100 font-semibold rounded-lg"
                    >
                        <FiLogOut className="mr-2" />
                        Leave Group
                    </button>
                    <button
                    onClick={handleReportGroup}
                    className="w-full flex items-center justify-center p-2 text-yellow-600 hover:bg-yellow-100 font-semibold rounded-lg"
                >
                        <FiAlertTriangle className="mr-2" />
                            Report Group
                    </button>
                    </>
                )}
            </div>
    </div>
  );
};

export default GroupDetails;