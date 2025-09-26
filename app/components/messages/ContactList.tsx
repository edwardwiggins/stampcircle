// app/components/messages/ContactList.tsx
'use client';

import { useState } from 'react';
import { useUser } from '@/app/context/user-context';
import { db, LocalUserProfile } from '@/app/lib/local-db';
import { useLiveQuery } from 'dexie-react-hooks';
import Image from 'next/image';
import { FiSearch, FiArrowLeft } from 'react-icons/fi';

interface ContactListProps {
    onSelectUser: (userId: string) => void;
    onBack: () => void;
}

const ContactList = ({ onSelectUser, onBack }: ContactListProps) => {
    const { userProfile } = useUser();
    const [searchTerm, setSearchTerm] = useState('');

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

    return (
        <div className="flex flex-col h-full">
            {/* Header */}
            <div className="p-4 border-b border-gray-200">
                <div className="flex items-center mb-4">
                    <button onClick={onBack} className="p-2 rounded-full hover:bg-gray-200 mr-2">
                        <FiArrowLeft size={20} />
                    </button>
                    <h1 className="text-xl font-bold text-gray-800">New Chat</h1>
                </div>
                <div className="relative">
                    <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                        type="text"
                        placeholder="Search connections..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                </div>
            </div>

            {/* Connections List */}
            <div className="flex-grow overflow-y-auto">
                {filteredConnections.length > 0 ? (
                    <ul>
                        {filteredConnections.map(user => (
                            <li key={user.user_id} onClick={() => onSelectUser(user.user_id)} className="flex items-center p-4 hover:bg-gray-100 cursor-pointer">
                                <Image
                                    src={user.profileImage || 'https://xfotoaervolaaiqrhgue.supabase.co/storage/v1/object/public/userImages/userIcon.jpg'}
                                    alt={user.displayName}
                                    width={50}
                                    height={50}
                                    className="rounded-full"
                                />
                                <div className="ml-4">
                                    <h3 className="font-semibold text-gray-800">{user.displayName}</h3>
                                    <p className="text-sm text-gray-500">@{user.username}</p>
                                </div>
                            </li>
                        ))}
                    </ul>
                ) : (
                    <p className="text-center text-gray-500 p-6">No connections found.</p>
                )}
            </div>
        </div>
    );
};

export default ContactList;