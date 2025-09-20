// app/page.tsx
'use client';

import { useState } from 'react';
import FeedContainer from './components/FeedContainer';
import { SlHome, SlPeople, SlBubbles, SlPieChart, SlBell } from "react-icons/sl";
import { useUser } from './context/user-context';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './lib/local-db';
import NotificationsPanel from './components/NotificationsPanel';
// --- NEW --- Import our new dropdown component
import ProfileDropdown from './components/ProfileDropdown';

export default function Home() {
    const { userProfile } = useUser();
    const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);

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

    return (
        <main>
            <header>
                <div className='header-left'>
                    <h1>StampCircle</h1>
                </div>
                <div className='header-middle'>
                    <div className='topmenu'><SlHome className='icon' size={30} /></div>
                    <div className='topmenu'><SlPeople className='icon' size={30} /></div>
                    <div className='topmenu'><SlBubbles className='icon' size={30} /></div>
                    <div className='topmenu'><SlPieChart className='icon' size={30} /></div>
                </div>
                <div className='header-right'>
                    <div 
                        className='topmenu-right cursor-pointer' 
                        onClick={() => setIsNotificationsOpen(!isNotificationsOpen)}
                    >
                        <SlBell className='icon' size={30} />
                        {unreadCount > 0 && (
                            <span className="absolute top-0 right-0 block h-5 w-5 rounded-full bg-red-500 text-white text-xs flex items-center justify-center">
                                {unreadCount}
                            </span>
                        )}
                    </div>
                    
                    {/* --- UPDATED --- The old avatar and logout button are replaced by the new dropdown component */}
                    <div className='topmenu-right'>
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
                    <h2>Navigation</h2>
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