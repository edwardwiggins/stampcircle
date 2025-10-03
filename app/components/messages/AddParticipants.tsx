// app/components/messages/AddParticipants.tsx
'use client';

import { useState } from 'react';
import { useUser } from '@/app/context/user-context';
import { db, LocalUserProfile } from '@/app/lib/local-db';
import { useLiveQuery } from 'dexie-react-hooks';
import Image from 'next/image';
import { FiSearch, FiArrowLeft, FiUserCheck } from 'react-icons/fi';

interface AddParticipantsProps {
  conversationId: number;
  onParticipantsAdded: () => void;
  onBack: () => void;
}

const AddParticipants = ({ conversationId, onParticipantsAdded, onBack }: AddParticipantsProps) => {
  const { userProfile, supabase } = useUser();
  const [searchTerm, setSearchTerm] = useState('');

    // Find users who are already in the group to exclude them from the list
    const existingParticipantIds = useLiveQuery(async () => {
        const participants = await db.social_conversation_participants.where({ conversation_id: conversationId }).toArray();
        return new Set(participants.map(p => p.user_id));
    }, [conversationId], new Set());

  const connections = useLiveQuery(async () => {
    if (!userProfile) return [];
    const allConnections = await db.social_user_connections
      .where('status').equals('active')
      .filter(conn => conn.user_id === userProfile.user_id || conn.target_user_id === userProfile.user_id)
      .toArray();
    const partnerIds = allConnections.map(conn => 
      conn.user_id === userProfile.user_id ? conn.target_user_id : conn.user_id
    );
    if (partnerIds.length === 0) return [];
    // Filter out users who are already participants
        const potentialAdditions = partnerIds.filter(id => !existingParticipantIds.has(id));
    return await db.userProfile.where('user_id').anyOf(potentialAdditions).toArray();
  }, [userProfile, existingParticipantIds], []);

  const filteredConnections = connections?.filter(user => 
    user.displayName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.username.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

    const handleAddUser = async (userId: string) => {
        const { error } = await supabase.rpc('add_group_participant', {
            p_conversation_id: conversationId,
            p_user_to_add_id: userId
        });
        if (error) {
            console.error("Failed to add user:", error);
        } else {
            // Manually add to local DB for instant UI update
            await db.social_conversation_participants.add({ conversation_id: conversationId, user_id: userId });
        }
    };

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center mb-4">
          <button onClick={onBack} className="p-2 rounded-full hover:bg-gray-200 mr-2">
            <FiArrowLeft size={20} />
          </button>
          <h1 className="text-xl font-bold text-gray-800">Add Participants</h1>
        </div>
        <div className="relative">
          <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="text" placeholder="Search connections..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-10 pr-4 py-2 border rounded-lg" />
        </div>
      </div>
      <div className="flex-grow overflow-y-auto">
        {filteredConnections.length > 0 ? (
          <ul>
            {filteredConnections.map(user => (
              <li key={user.user_id} onClick={() => handleAddUser(user.user_id)} className="flex items-center justify-between p-4 hover:bg-gray-100 cursor-pointer">
                                <div className="flex items-center">
                    <Image src={user.profileImage || '/default-avatar.jpg'} alt={user.displayName} width={50} height={50} className="rounded-full" />
                    <div className="ml-4">
                      <h3 className="font-semibold text-gray-800">{user.displayName}</h3>
                    </div>
                                </div>
                                <FiUserCheck size={20} className="text-green-500" />
              </li>
            ))}
          </ul>
        ) : ( <p className="text-center text-gray-500 p-6">No more connections to add.</p> )}
      </div>
    </div>
  );
};

export default AddParticipants;