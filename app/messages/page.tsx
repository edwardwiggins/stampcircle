// app/messages/page.tsx
'use client';

import { useState, useEffect } from 'react';
import ConversationList from '../components/messages/ConversationList';
import ConversationView from '../components/messages/ConversationView';
import ContactList from '../components/messages/ContactList';
import { useUser } from '../context/user-context';
// --- REMOVED --- No longer need to import reconcileMessages here
// import { reconcileMessages } from '../lib/supabase-sync-utils';

type LeftPanelView = 'conversations' | 'contacts';

const MessagesPage = () => {
    const { userProfile, loading } = useUser();
    const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
    const [leftPanelView, setLeftPanelView] = useState<LeftPanelView>('conversations');

    // --- REMOVED --- The entire useEffect that called reconcileMessages is gone.
    // This is now handled globally in the background.

    const handleSelectUser = (userId: string) => {
        setSelectedUserId(userId);
        setLeftPanelView('conversations');
    };

    if (loading || !userProfile) {
        return (
            <div className="flex h-screen items-center justify-center">
                <p>Loading messages...</p>
            </div>
        );
    }

    return (
        <div className="main-container">
            <div className="conversationlist-container">
                {leftPanelView === 'conversations' ? (
                    <ConversationList 
                        onSelectConversation={handleSelectUser} 
                        onNewMessage={() => setLeftPanelView('contacts')} 
                    />
                ) : (
                    <ContactList 
                        onSelectUser={handleSelectUser}
                        onBack={() => setLeftPanelView('conversations')}
                    />
                )}
            </div>

            <div className="conversationview-container">
                {selectedUserId ? (
                    <ConversationView partnerId={selectedUserId} />
                ) : (
                    <div className="flex-grow flex items-center justify-center">
                        <div className="text-center">
                            <h2 className="text-2xl font-semibold text-gray-700">Select a conversation</h2>
                            <p className="text-gray-500 mt-2">Choose from your existing conversations or start a new one.</p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default MessagesPage;