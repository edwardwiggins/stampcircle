// app/page.tsx
'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import FeedContainer from './components/FeedContainer';
import OnboardingFlow from './components/onboarding/OnboardingFlow';
import { SlHome, SlPeople, SlBubbles, SlPieChart, SlBell } from "react-icons/sl";
import { useUser } from './context/user-context';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './lib/local-db';
import NotificationsPanel from './components/NotificationsPanel';
import ProfileDropdown from './components/ProfileDropdown';

export default function Home() {
    const { userProfile, supabase, updateUserProfile } = useUser();
    const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
    const [activeView, setActiveView] = useState<View>('home');
    const [showOnboarding, setShowOnboarding] = useState(false);

    // --- THIS IS THE FIX ---
    // This logic is now more robust. It explicitly hides the modal if onboarding is complete.
    useEffect(() => {
        if (userProfile) {
            if (!userProfile.has_completed_onboarding) {
                setShowOnboarding(true);
            } else {
                setShowOnboarding(false);
            }
        }
    }, [userProfile]);

    const unreadCount = useLiveQuery(
        () => userProfile 
            ? db.social_user_notifications
                .where({ receiving_user_id: userProfile.user_id, is_read: 0 })
                .count()
            : 0,
        [userProfile],
        0 
    );
    
    if (!userProfile) {
        return <div>Loading...</div>;
    }

    const handleOnboardingComplete = async () => {
        if (!userProfile || !supabase) return;

        setShowOnboarding(false);

        try {
            const updatedProfile = { ...userProfile, has_completed_onboarding: true };
            
            // This immediately updates the context's state, which will trigger the useEffect above to run
            updateUserProfile(updatedProfile);

            // Update the local database
            await db.userProfile.put(updatedProfile);

            // Update the remote database in the background
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
            
            <header>
                <div className='header-left'>
                    <h2>StampCircle</h2>
                </div>
                <div className='header-middle'>
                    <div className='topmenu' data-tooltip-id="app-tooltip" data-tooltip-content="Home Feed" >
                        <SlHome className='icon' size={26} />
                    </div>
                    <div className='topmenu' data-tooltip-id="app-tooltip" data-tooltip-content="My Network" >
                        <SlPeople className='icon' size={26} />
                    </div>
                    <Link href="/messages" className='topmenu' data-tooltip-id="app-tooltip" data-tooltip-content="Messages" >
                            <SlBubbles className='icon' size={26} />
                    </Link>
                    <div className='topmenu' data-tooltip-id="app-tooltip" data-tooltip-content="My Collection" >
                        <SlPieChart className='icon' size={26} />
                    </div>
                </div>
                <div className='header-right'>
                    <div 
                        className='topmenu-right relative cursor-pointer' 
                        onClick={() => setIsNotificationsOpen(!isNotificationsOpen)}
                        data-tooltip-id="app-tooltip" 
                        data-tooltip-content="Notifications"
                    >
                        <SlBell className='icon absolute right-[14px]' size={26} />
                        {unreadCount > 0 && (
                            <span className='unread-count'>
                                {unreadCount}
                            </span>
                        )}
                    </div>
                    
                    <div className='topmenu-right justify-center mb-[4px]'>
                       <ProfileDropdown userProfile={userProfile} />
                    </div>
                </div>
            </header>
            
            <NotificationsPanel 
                isOpen={isNotificationsOpen} 
                onClose={() => setIsNotificationsOpen(false)} 
                userProfile={userProfile} 
            />

            <div className='container'>
                <aside className='left-sidebar'>
                    <div className="p-4 rounded-lg shadow bg-white text-center">
                        <Image
                            src={userProfile.profileImage || userProfile.default_profileImage}
                            alt="Profile Picture"
                            width={80}
                            height={80}
                            className="rounded-full mx-auto mb-4"
                        />
                        <h3 className="font-bold text-lg">{`${getGreeting()},`}</h3>
                        <p className="text-gray-800 text-xl">{userProfile.displayName}</p>
                    </div>
                </aside>
                <div className='content'>
                    <FeedContainer />
                </div>
                <aside className='right-sidebar'>
                    <h2>Extras</h2>
                    <p>Friends, Ads, or Suggested Content</p>
                </aside>
            </div>
            <footer>
                <p>© 2025 StampCircle</p>
            </footer>
        </main>
    );
}