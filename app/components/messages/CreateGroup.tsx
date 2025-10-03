// app/components/messages/CreateGroup.tsx
'use client';

import { useState } from 'react';
import { useUser } from '@/app/context/user-context';
import { db, LocalUserProfile } from '@/app/lib/local-db';
import { useLiveQuery } from 'dexie-react-hooks';
import Image from 'next/image';
import { FiSearch, FiArrowLeft, FiX } from 'react-icons/fi';

interface CreateGroupProps {
  onGroupCreated: () => void;
  onBack: () => void;
}

const CreateGroup = ({ onGroupCreated, onBack }: CreateGroupProps) => {
  const { userProfile, supabase } = useUser();
  const [searchTerm, setSearchTerm] = useState('');
    const [groupName, setGroupName] = useState('');
    const [selectedUsers, setSelectedUsers] = useState<LocalUserProfile[]>([]);

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
    return await db.userProfile.where('user_id').anyOf(partnerIds).toArray();
  }, [userProfile], []);

  const filteredConnections = connections?.filter(user => 
    user.displayName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.username.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

    const handleToggleUser = (user: LocalUserProfile) => {
        setSelectedUsers(prev => 
            prev.some(su => su.user_id === user.user_id)
                ? prev.filter(su => su.user_id !== user.user_id)
                : [...prev, user]
        );
    };

    const handleCreateGroup = async () => {
        if (groupName.trim() && selectedUsers.length > 0) {
            const participantIds = selectedUsers.map(u => u.user_id);
            const { error } = await supabase.rpc('create_group_chat', {
                participant_ids: participantIds,
                group_name: groupName
            });

            if (error) {
                console.error("Failed to create group chat:", error);
            } else {
                onGroupCreated();
            }
        }
    };

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center mb-4">
          <button onClick={onBack} className="p-2 rounded-full hover:bg-gray-200 mr-2">
            <FiArrowLeft size={20} />
          </button>
          <h1 className="text-xl font-bold text-gray-800">Create Group Chat</h1>
        </div>
                <input 
                    type="text" 
                    placeholder="Group Name" 
                    value={groupName}
                    onChange={(e) => setGroupName(e.target.value)}
                    className="w-full mb-4 px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
        <div className="relative">
          <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search connections to add..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border rounded-lg focus:outline-none"
          />
        </div>
      </div>

      <div className="flex-grow overflow-y-auto p-2">
        <ul>
          {filteredConnections.map(user => (
            <li key={user.user_id} onClick={() => handleToggleUser(user)} className="flex items-center p-2 rounded-lg hover:bg-gray-100 cursor-pointer">
              <input 
                                type="checkbox" 
                                className="mr-4 h-5 w-5" 
                                checked={selectedUsers.some(su => su.user_id === user.user_id)}
                                readOnly
                            />
              <Image src={user.profileImage || '/default-avatar.jpg'} alt={user.displayName} width={40} height={40} className="rounded-full" />
              <div className="ml-3">
                <h3 className="font-semibold text-gray-800">{user.displayName}</h3>
              </div>
            </li>
          ))}
        </ul>
      </div>
            <div className="flex-shrink-0 p-4 border-t">
                <button 
                    onClick={handleCreateGroup}
                    disabled={!groupName.trim() || selectedUsers.length === 0}
                    className="w-full bg-blue-500 text-white py-2 px-4 rounded-lg disabled:bg-gray-300"
                >
                    Create Group ({selectedUsers.length} members)
                </button>
            </div>
    </div>
  );
};

export default CreateGroup;