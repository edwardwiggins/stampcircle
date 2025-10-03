// app/components/Header.tsx
'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { SlHome, SlPeople, SlBubbles, SlPieChart, SlBell, SlEnvolopeLetter } from "react-icons/sl";
import { useUser } from '@/app/context/user-context';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/app/lib/local-db';
import type { LocalNotification } from '@/app/lib/local-db';
import { reconcileMessages } from '@/app/lib/supabase-sync-utils';
import NotificationsPanel from './NotificationsPanel';
import ProfileDropdown from './ProfileDropdown';

export default function Header() {
 const { 
    userProfile, 
    supabase, 
    newPostsAvailable,
    setNewPostsAvailable,
 } = useUser();
 
 const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const pathname = usePathname();

 const unreadNotificationsCount = useLiveQuery(
    () => userProfile 
        ? db.social_user_notifications
            .where({ receiving_user_id: userProfile.user_id, is_read: 0 })
            // --- UPDATED --- Correctly excludes both new message types from the bell count
            .and(notif => notif.notification_type !== 'new_direct_message' && notif.notification_type !== 'new_group_message')
            .count()
        : 0,
    [userProfile]
 );

  // --- UPDATED --- This query now correctly checks for BOTH new message types
  const unreadMessageCount = useLiveQuery(
      () => userProfile
          ? db.social_user_notifications
              .where({ receiving_user_id: userProfile.user_id, is_read: 0 })
              .and(notif => notif.notification_type === 'new_direct_message' || notif.notification_type === 'new_group_message')
              .count()
          : 0,
    [userProfile]
  );

 useEffect(() => {
    if (!supabase || !userProfile) return;
  
    const isMessagesPageActive = pathname === '/messages';

    const postsChannel = supabase
        .channel('social-posts-changes')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'social_posts' }, (payload) => { 
            if (payload.new.author_id !== userProfile.user_id) { 
              setNewPostsAvailable(true); 
            } 
        })
        .subscribe();

    const notificationsChannel = supabase
        .channel('notifications-channel')
        .on('broadcast', { event: 'new_notification' }, async ({ payload }) => { 
            const userNotifications = payload.new_notifications.filter((n: LocalNotification) => n.receiving_user_id === userProfile.user_id); 
            if (userNotifications.length > 0) {
                const notificationsToStore = userNotifications.map((n: any) => ({ 
                    ...n, 
                    is_read: ((n.notification_type === 'new_direct_message' || n.notification_type === 'new_group_message') && isMessagesPageActive) ? 1 : 0 
                })); 
                await db.social_user_notifications.bulkPut(notificationsToStore);

                const idsToMarkAsReadOnServer = notificationsToStore.filter(n => n.is_read === 1).map(n => n.id);
                if (idsToMarkAsReadOnServer.length > 0) {
                  await supabase.from('social_user_notifications').update({ is_read: true }).in('id', idsToMarkAsReadOnServer);
                }

                const hasNewMessage = userNotifications.some(n => n.notification_type === 'new_direct_message' || n.notification_type === 'new_group_message');
                if (hasNewMessage) {
                  reconcileMessages(supabase, userProfile.user_id);
                }
            }
        })
        .subscribe();
  
    return () => { 
        supabase.removeChannel(postsChannel); 
        supabase.removeChannel(notificationsChannel);
    };
 }, [supabase, userProfile, setNewPostsAvailable, pathname]);

    if (!userProfile) {
 return (
   <header>
    <div className='header-left'><h2>StampCircle</h2></div>
    <div className='header-middle'></div>
    <div className='header-right'></div>
   </header>
  ); 
}

    // --- UPDATED --- This function now correctly clears both new message notification types
    const clearMessageNotifications = async () => {
        if (!userProfile) return;
        const unreadMessageNotifications = await db.social_user_notifications
            .where({ receiving_user_id: userProfile.user_id, is_read: 0 })
            .and(notification => notification.notification_type === 'new_direct_message' || notification.notification_type === 'new_group_message')
            .toArray();
        
        const idsToUpdate = unreadMessageNotifications.map(n => n.id);
        if (idsToUpdate.length > 0) {
            await db.social_user_notifications.where('id').anyOf(idsToUpdate).modify({ is_read: 1 });
            await supabase.from('social_user_notifications').update({ is_read: true }).in('id', idsToUpdate);
        }
    };

    return (
        <>
            <header>
                <div className='header-left'><h2>StampCircle</h2></div>
                <div className='header-middle'>
                    <Link href="/" className='topmenu' data-tooltip-id="app-tooltip" data-tooltip-content="Home Feed">
                        <SlHome className={pathname === '/' ? 'icon-orange' : 'icon'} size={26} />
                    </Link>
                    <div className='topmenu' data-tooltip-id="app-tooltip" data-tooltip-content="My Network" >
                        <SlPeople className={pathname === '/network' ? 'icon-orange' : 'icon'} size={26} />
                    </div>
                    <Link 
                        href="/messages" 
                        className='topmenu relative' 
                        data-tooltip-id="app-tooltip" 
                        data-tooltip-content={unreadMessageCount > 0 ? `Messages (${unreadMessageCount})` : "Messages"}
                        onClick={clearMessageNotifications}
                    >
                        {unreadMessageCount === 0 ? (
                            <SlBubbles className={pathname === '/messages' ? 'icon-orange' : 'icon'} size={26} />
                        ) : (
                            <SlEnvolopeLetter className={pathname === '/messages' ? 'icon-orange' : 'icon-red'} size={26} />
                        )}

                    {/*    {unreadMessageCount > 0 && (
                            <span className="absolute top-0 right-0 text-xs bg-red-500 text-white rounded-full w-4 h-4 flex items-center justify-center">
                                {unreadMessageCount}
                            </span>
                        )}
                            */}
                    </Link>
                    <div className='topmenu' data-tooltip-id="app-tooltip" data-tooltip-content="My Collection" >
                        <SlPieChart className={pathname === '/collection' ? 'icon-orange' : 'icon'} size={26} />
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
                        {unreadNotificationsCount > 0 && (
                            <span className='unread-count'>
                                {unreadNotificationsCount}
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
        </>
    );
}