// app/messages/page.tsx
'use client';

import { useState, useEffect } from 'react';
import ConversationList from '@/app/components/messages/ConversationList';
import ConversationView from '@/app/components/messages/ConversationView';
import ContactList from '@/app/components/messages/ContactList';
import { useUser } from '@/app/context/user-context';
import { reconcileMessages, findOrCreateConversation } from '@/app/lib/supabase-sync-utils';
import Image from 'next/image';

type LeftPanelView = 'conversations' | 'contacts';
type SelectedConversation = {
    conversationId: number;
    partnerId: string;
}

const MessagesPage = () => {
const { userProfile, loading: userLoading, supabase } = useUser();
const [selectedConversation, setSelectedConversation] = useState<SelectedConversation | null>(null);
const [leftPanelView, setLeftPanelView] = useState<LeftPanelView>('conversations');
  // --- NEW --- State to control when the list is allowed to fetch data
  const [isDataReady, setIsDataReady] = useState(false);

useEffect(() => {
   const initialLoad = async () => {
        if (userProfile?.user_id) {
            // Wait for the reconciliation to finish before allowing children to render
            await reconcileMessages(supabase, userProfile.user_id);
            setIsDataReady(true);
        }
    };
    initialLoad();
}, [userProfile?.user_id, supabase]);

const handleSelectConversation = (conversationId: number, partnerId: string) => {
 setSelectedConversation({ conversationId, partnerId });
};

  const handleSelectUserFromContacts = async (partnerId: string) => {
    if (!userProfile) return;
    const conversationId = await findOrCreateConversation(supabase, userProfile.user_id, partnerId);
    if (conversationId) {
        // After creating a new conversation, re-reconcile to get the new data locally
        await reconcileMessages(supabase, userProfile.user_id);
        setSelectedConversation({ conversationId, partnerId });
        setLeftPanelView('conversations');
    } else {
        console.error("Could not find or create a conversation.");
    }
  };

if (userLoading || !userProfile) {
 return (
 <div className="flex flex-col h-screen items-center justify-center">
  <Image
   src='https://xfotoaervolaaiqrhgue.supabase.co/storage/v1/object/public/resourceImages/stamp-collecting-labrador-cartoon.png'
   alt='stamp collecting labrador'
   width={350}
   height={350}
   className="object-contain"
  />
  <p className="mt-[16px] text-xl text-gray-400">Loading messages...</p>
 </div>
 );
}

return (
  <div className="flex h-screen bg-white overflow-y-hidden">
    <div className="w-1/3 flex flex-col mt-[86px]">
      {leftPanelView === 'conversations' ? (
        <ConversationList 
                    isDataReady={isDataReady} // --- NEW --- Pass the ready signal down
          onSelectConversation={handleSelectConversation} 
          onNewMessage={() => setLeftPanelView('contacts')} 
        />
      ) : (
        <ContactList 
          onSelectUser={handleSelectUserFromContacts}
          onBack={() => setLeftPanelView('conversations')}
        />
      )}
    </div>

    <div className="w-2/3 flex flex-col mt-[70px]">
      {selectedConversation ? (
        <ConversationView 
                  key={selectedConversation.conversationId}
                  conversationId={selectedConversation.conversationId} 
                  partnerId={selectedConversation.partnerId} 
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