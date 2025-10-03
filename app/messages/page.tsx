// app/messages/page.tsx
'use client';

import { useState, useEffect } from 'react';
import ConversationList from '@/app/components/messages/ConversationList';
import ConversationView from '@/app/components/messages/ConversationView';
import ContactList from '@/app/components/messages/ContactList';
import CreateGroup from '@/app/components/messages/CreateGroup';
import GroupDetails from '@/app/components/messages/GroupDetails';
import AddParticipants from '@/app/components/messages/AddParticipants';
import { useUser } from '@/app/context/user-context';
import { reconcileMessages, findOrCreateConversation } from '@/app/lib/supabase-sync-utils';
import Image from 'next/image';

type LeftPanelView = 'conversations' | 'contacts' | 'new_group' | 'group_details' | 'add_participants'; // --- UPDATED ---

type SelectedConversation = {
    conversationId: number;
    partnerId: string | null;
}

const MessagesPage = () => {
const { userProfile, loading: userLoading, supabase } = useUser();
const [selectedConversation, setSelectedConversation] = useState<SelectedConversation | null>(null);
const [leftPanelView, setLeftPanelView] = useState<LeftPanelView>('conversations');

useEffect(() => {
   const initialLoad = async () => {
        if (userProfile?.user_id) {
            await reconcileMessages(supabase, userProfile.user_id);
        }
    };
    initialLoad();
}, [userProfile?.user_id, supabase]);

const handleSelectConversation = (conversationId: number, partnerId: string | null) => {
 setSelectedConversation({ conversationId, partnerId });
};

  const handleSelectUserFromContacts = async (partnerId: string) => {
    if (!userProfile) return;
    const conversationId = await findOrCreateConversation(supabase, userProfile.user_id, partnerId);
    if (conversationId) {
        await reconcileMessages(supabase, userProfile.user_id);
        setSelectedConversation({ conversationId, partnerId });
        setLeftPanelView('conversations');
    }
  };

  const handleGroupCreated = async () => {
    if (!userProfile) return;
    await reconcileMessages(supabase, userProfile.user_id);
    setLeftPanelView('conversations');
  };

if (userLoading || !userProfile) {
    return (
     <div className="flex flex-col h-screen items-center justify-center">
      <Image
       src='/images/stamp-collecting-labrador-cartoon.png'
       alt='stamp collecting labrador'
       width={250}
       height={250}
       className="fit-contain"
      />
      <p className="mt-[16px] text-xl text-gray-400">Loading messages...</p>
     </div>
    );
   }

return (
  <div className="flex h-screen bg-white overflow-y-hidden">
    <div className="w-1/3 flex flex-col mt-[86px]">
            {leftPanelView === 'conversations' && (
                <ConversationList 
                    onSelectConversation={handleSelectConversation} 
                    onNewMessage={() => setLeftPanelView('contacts')} 
                />
            )}
            {leftPanelView === 'contacts' && (
                <ContactList 
                    onSelectUser={handleSelectUserFromContacts}
                    onBack={() => setLeftPanelView('conversations')}
                    onNewGroup={() => setLeftPanelView('new_group')}
                />
            )}
            {leftPanelView === 'new_group' && (
                <CreateGroup
                    onGroupCreated={handleGroupCreated}
                    onBack={() => setLeftPanelView('contacts')}
                />
            )}
            {leftPanelView === 'group_details' && selectedConversation && (
                    <GroupDetails
                        conversationId={selectedConversation.conversationId}
                        onBack={() => setLeftPanelView('conversations')}
                        onAddParticipants={() => setLeftPanelView('add_participants')}
                    />
                )}
            {leftPanelView === 'add_participants' && selectedConversation && (
                    <AddParticipants
                        conversationId={selectedConversation.conversationId}
                        onParticipantsAdded={() => setLeftPanelView('group_details')}
                        onBack={() => setLeftPanelView('group_details')}
                    />
                )}
    </div>

    <div className="w-2/3 flex flex-col mt-[70px]">
      {selectedConversation ? (
        <ConversationView 
                  key={selectedConversation.conversationId}
                  conversationId={selectedConversation.conversationId} 
                  partnerId={selectedConversation.partnerId}
                  onShowDetails={() => setLeftPanelView('group_details')}
              />
      ) : (
        <div className="flex-grow flex items-center justify-center bg-gray-50">
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