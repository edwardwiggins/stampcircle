// app/components/NotificationItem.tsx

'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, LocalNotification, LocalUserProfile } from '@/app/lib/local-db';
import { formatRelativeTime } from '@/app/lib/utils';

interface NotificationItemProps {
    notification: LocalNotification;
}

export default function NotificationItem({ notification }: NotificationItemProps) {
    // --- UPDATED --- Fetch profiles for ALL senders involved in the notification
    const senderProfiles = useLiveQuery(
        () => notification.data?.senders 
            ? db.userProfile.where('user_id').anyOf(notification.data.senders).toArray()
            : db.userProfile.where('user_id').equals(notification.last_sending_user_id).toArray(),
        [notification.data?.senders, notification.last_sending_user_id]
    );

    // Find the profile of the most recent person for the avatar
    const lastSenderProfile = senderProfiles?.find(p => p.user_id === notification.last_sending_user_id);

    if (!senderProfiles || !lastSenderProfile) {
        return <div className="notification-item">Loading notification...</div>;
    }

    // --- NEW --- Generate a dynamic string of sender names
    let senderDisplayString = '';
    const senderCount = senderProfiles.length;

    if (senderCount === 1) {
        senderDisplayString = senderProfiles[0].displayName;
    } else if (senderCount === 2) {
        // Find the two profiles to ensure correct order if needed, though order isn't critical here
        senderDisplayString = `${senderProfiles[0].displayName} and ${senderProfiles[1].displayName}`;
    } else if (senderCount > 2) {
        // Show the first sender and a count of the others
        const firstSenderName = senderProfiles.find(p => p.user_id === notification.data.senders[0])?.displayName || "Someone";
        const othersCount = senderCount - 1;
        senderDisplayString = `${firstSenderName} and ${othersCount} others`;
    }


    let message = '';
    let link = '#';

    switch (notification.notification_type) {
        case 'mention':
            message = notification.entity_type === 'post' ? 'mentioned you in a post.' : 'mentioned you in a comment.';
            link = `/post/${notification.data.post_id}`;
            break;
        case 'new_comment':
            message = 'commented on your post.';
            link = `/post/${notification.data.post_id}`;
            break;
        case 'reply':
            message = 'replied to your comment.';
            link = `/post/${notification.data.post_id}`;
            break;
        case 'reaction':
            message = notification.entity_type === 'post' ? 'reacted to your post.' : 'reacted to your comment.';
            link = `/post/${notification.data.post_id}`;
            break;
        case 'share':
            message = 'shared your post.';
            link = `/post/${notification.data.entity_id}`; // Link to the new share post
            break;
        case 'connection_request':
            message = 'sent you a Connection Request.';
            link = '#';
            break;
        case 'connection_accepted':
            message = 'accepted your request to connect.';
            link = '#';
            break;
        default:
            message = 'sent you a notification.';
    }

    const defaultAvatar = '/default-avatar.jpg';

    return (
        <Link href={link} className={`notification-item ${notification.is_read === 0 ? 'unread' : ''}`}>
            <Image
                src={lastSenderProfile.profileImage || defaultAvatar}
                alt={`${lastSenderProfile.displayName}'s avatar`}
                width={40}
                height={40}
                className="notification-avatar"
            />
            <div className="notification-content">
                <p>
                    {/* --- UPDATED --- Use the new dynamic sender string */}
                    <span className="username">{senderDisplayString}</span> {message}
                </p>
                <p className="timestamp">
                    {formatRelativeTime(new Date(notification.created_at))}
                </p>
            </div>
            {notification.is_read === 0 && <div className="notification-unread-dot"></div>}
        </Link>
    );
}