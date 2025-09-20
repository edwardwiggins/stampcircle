// app/components/NotificationsPanel.tsx

'use client';

import { useEffect, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, LocalNotification, LocalUserProfile } from '@/app/lib/local-db';
import NotificationItem from './NotificationItem';
import { useUser } from '@/app/context/user-context';


interface NotificationsPanelProps {
    isOpen: boolean;
    onClose: () => void;
    userProfile: LocalUserProfile | null;
}

export default function NotificationsPanel({ isOpen, onClose, userProfile }: NotificationsPanelProps) {
    const panelRef = useRef<HTMLDivElement>(null);
    const { supabase } = useUser();

    const notifications = useLiveQuery(
        () => userProfile 
            ? db.social_user_notifications
                .where('receiving_user_id').equals(userProfile.user_id)
                .reverse()
                .sortBy('created_at')
            : [],
        [userProfile]
    );

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (isOpen && panelRef.current && !panelRef.current.contains(event.target as Node)) {
                onClose();
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isOpen, onClose]);

    const handleMarkAllAsRead = async () => {
        if (!notifications || !supabase) return;

        const unreadIds = notifications.filter(n => n.is_read === 0).map(n => n.id);
        if (unreadIds.length === 0) return;
        
        // --- UPDATED --- Change local update to use the number 1
        const updates = unreadIds.map(id => ({ key: id, changes: { is_read: 1 } }));
        await db.social_user_notifications.bulkUpdate(updates);

        // This remote update is correct, as Supabase (Postgres) can interpret `true` correctly.
        const { error } = await supabase
            .from('social_user_notifications')
            .update({ is_read: true })
            .in('id', unreadIds);

        if (error) {
            console.error("Failed to sync 'mark all as read':", error);
        }
    };

    if (!isOpen) {
        return null;
    }

    return (
        <div ref={panelRef} className="notifications-panel">
            <div className="notifications-header">
                <h3>Notifications</h3>
                <button onClick={handleMarkAllAsRead}>Mark all as read</button>
            </div>
            <div className="notifications-list">
                {notifications && notifications.length > 0 ? (
                    notifications.map(notification => (
                        <NotificationItem key={notification.id} notification={notification} />
                    ))
                ) : (
                    <div className="no-notifications">
                        <p>You have no notifications yet.</p>
                    </div>
                )}
            </div>
        </div>
    );
}