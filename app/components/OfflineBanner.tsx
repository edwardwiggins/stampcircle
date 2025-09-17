'use client';

import { useUser } from '@/app/context/user-context';
import { SlCloudUpload } from 'react-icons/sl';

export default function OfflineBanner() {
    // Get the isOffline state from our global context.
    const { isOffline } = useUser();

    // Only render the banner if the user is offline.
    if (!isOffline) {
        return null;
    }

    return (
        <div className="offline-banner">
            <SlCloudUpload className="mr-2" />
            <p>Currently working offline. You can continue working. We will resync once you are connected again.</p>
        </div>
    );
}