// app/(main)/profile/[username]/ProfileClient.tsx

'use client';

import Image from 'next/image';
import { useUser } from '@/app/context/user-context';
import PushNotificationManager from '@/app/components/PushNotificationManager';
import { LocalUserProfile } from '@/app/lib/local-db';

interface ProfileClientProps {
    profile: LocalUserProfile;
}

export default function ProfileClient({ profile }: ProfileClientProps) {
    // Get the currently logged-in user from the context
    const { userProfile: currentUser } = useUser();

    // Check if the profile being viewed belongs to the logged-in user
    const isOwnProfile = currentUser?.user_id === profile.user_id;

    const defaultHeader = '/default-header.jpg';
    const defaultAvatar = '/default-avatar.jpg';

    return (
        <div className="profile-container">
            <div className="profile-header">
                <Image 
                    src={profile.user_headerImage || defaultHeader}
                    alt={`${profile.displayName}'s header image`}
                    fill={true}
                    className="profile-header-image"
                    priority
                />
                <div className="profile-avatar-container">
                    <Image
                        src={profile.profileImage || defaultAvatar}
                        alt={`${profile.displayName}'s avatar`}
                        width={100}
                        height={100}
                        className="profile-avatar"
                    />
                </div>
            </div>
            <div className="profile-info">
                <h1>{profile.displayName}</h1>
                <p>@{profile.username}</p>
            </div>
            
            {/* User's posts will be rendered here in the future */}
            <div className="p-6">
                {/* --- NEW --- Conditionally render the notification manager */}
                {isOwnProfile && (
                    <div className="mb-6 p-4 rounded-lg bg-gray-50">
                        <h2 className="text-lg font-semibold mb-2">Notification Settings</h2>
                        <PushNotificationManager />
                    </div>
                )}
                
                <h2 className="text-lg font-semibold">Posts</h2>
                <p>User's posts will appear here.</p>
            </div>
        </div>
    );
}