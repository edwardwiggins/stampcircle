// app/page.tsx
'use client';

import { useState } from 'react';
import Image from 'next/image';
import FeedContainer from './components/FeedContainer';
import NetworkContainer from './components/NetworkContainer';
import MessagesContainer from './components/MessagesContainer';
import CollectionContainer from './components/CollectionContainer';
import { SlHome, SlPeople, SlBubbles, SlPieChart, SlBell } from "react-icons/sl";
import { useUser } from './context/user-context';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './lib/local-db';
import NotificationsPanel from './components/NotificationsPanel';
import ProfileDropdown from './components/ProfileDropdown';

type View = 'home' | 'network' | 'messages' | 'collection';

export default function Home() {
    const { userProfile } = useUser();
    const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
    const [activeView, setActiveView] = useState<View>('home');

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

    const renderContent = () => {
        switch (activeView) {
            case 'home':
                return <FeedContainer />;
            case 'network':
                return <NetworkContainer />;
            case 'messages':
                return <MessagesContainer />;
            case 'collection':
                return <CollectionContainer />;
            default:
                return <FeedContainer />;
        }
    };

    const getIconClass = (view: View) => {
        return `icon cursor-pointer ${activeView === view ? 'text-blue-600' : 'text-gray-700'}`;
    };

    return (
        <main>
            <header>
                <div className='header-left'>
                    <h1>StampCircle</h1>
                </div>
                <div className='header-middle'>
                    <div className='topmenu' onClick={() => setActiveView('home')}>
                        <SlHome className={getIconClass('home')} size={30} data-tooltip-id="app-tooltip" data-tooltip-content="Home Feed" />
                    </div>
                    <div className='topmenu' onClick={() => setActiveView('network')}>
                        <SlPeople className={getIconClass('network')} size={30} data-tooltip-id="app-tooltip" data-tooltip-content="My Network" />
                    </div>
                    <div className='topmenu' onClick={() => setActiveView('messages')}>
                        <SlBubbles className={getIconClass('messages')} size={30} data-tooltip-id="app-tooltip" data-tooltip-content="Messages" />
                    </div>
                    <div className='topmenu' onClick={() => setActiveView('collection')}>
                        <SlPieChart className={getIconClass('collection')} size={30} data-tooltip-id="app-tooltip" data-tooltip-content="My Collection" />
                    </div>
                </div>
                <div className='header-right'>
                    <div 
                        className='topmenu-right relative cursor-pointer' 
                        onClick={() => setIsNotificationsOpen(!isNotificationsOpen)}
                        data-tooltip-id="app-tooltip" 
                        data-tooltip-content="Notifications"
                    >
                        <SlBell className='icon absolute right-[14px]' size={30} />
                        {unreadCount > 0 && (
                            <span className="absolute top-[2px] right-[16px] block h-5 w-5 rounded-full bg-red-500 text-white text-xs flex items-center justify-center">
                                {unreadCount}
                            </span>
                        )}
                    </div>
                    
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
                    {renderContent()}
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