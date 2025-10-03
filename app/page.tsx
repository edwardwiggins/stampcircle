// app/page.tsx
'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import FeedContainer from './components/FeedContainer';
import OnboardingFlow from './components/onboarding/OnboardingFlow';
import { useUser } from './context/user-context';
import { db } from './lib/local-db';
import TrendingSidebar from './components/TrendingSidebar';

export default function Home() {
  const { userProfile, supabase, updateUserProfile } = useUser();
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    if (userProfile) {
      if (!userProfile.has_completed_onboarding) {
        setShowOnboarding(true);
      } else {
        setShowOnboarding(false);
      }
    }
  }, [userProfile]);
  
  if (!userProfile) {
    return <div className="flex flex-col h-screen items-center justify-center">
              <Image
                src='/images/stamp_community.png'
                alt="Profile Picture"
                width={357}
                height={221}
                className="mx-auto mb-4"
              />
              <p className="mt-[16px] text-xl text-gray-400">Getting your feed ready...</p>
            </div>;
  }

  const handleOnboardingComplete = async () => {
    if (!userProfile || !supabase) return;
    setShowOnboarding(false);
    try {
      const updatedProfile = { ...userProfile, has_completed_onboarding: true };
      updateUserProfile(updatedProfile);
      await db.userProfile.put(updatedProfile);
      const { error } = await supabase
        .from('user_profile')
        .update({ has_completed_onboarding: true })
        .eq('user_id', userProfile.user_id);
      if (error) throw error;
    } catch (error) {
      console.error("Failed to update onboarding status:", error);
    }
  };

  const getGreeting = () => {
    const currentHour = new Date().getHours();
    if (currentHour < 12) {
      return 'Good morning';
    } else if (currentHour < 18) {
      return 'Good afternoon';
    } else {
      return 'Good evening';
    }
  };

  return (
    <main>
      {showOnboarding && <OnboardingFlow onComplete={handleOnboardingComplete} />}
      
            {/* The Header is now rendered globally in layout.tsx */}

      <div className='container'>
        <aside className='left-sidebar'>
          <div className="headings p-4 rounded-lg shadow bg-white text-center">
            <Image
              src={userProfile.profileImage || userProfile.default_profileImage}
              alt="Profile Picture"
              width={80}
              height={80}
              className="rounded-full mx-auto mb-4"
            />
            <h2 className="font-bold text-lg">{`${getGreeting()},`}</h2>
            <p className="text-gray-800 text-xl">{userProfile.displayName}</p>
          </div>
        </aside>
        <div className='content'>
          <FeedContainer />
        </div>
        <aside className='right-sidebar'>
          <TrendingSidebar />
        </aside>
      </div>
      <footer>
        <p>© 2025 StampCircle</p>
      </footer>
    </main>
  );
}