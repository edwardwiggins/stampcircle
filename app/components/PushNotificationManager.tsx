// app/components/PushNotificationManager.tsx

'use client';

import { useState, useEffect } from 'react';
import { useUser } from '@/app/context/user-context';
import { db } from '@/app/lib/local-db';

// This is a helper function to convert the VAPID key
function urlBase64ToUint8Array(base64String: string) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
        .replace(/\-/g, '+')
        .replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}

export default function PushNotificationManager() {
    const { supabase, userProfile } = useUser();
    const [permissionStatus, setPermissionStatus] = useState<NotificationPermission>('default');
    const [isSubscribed, setIsSubscribed] = useState(false);
    const [loading, setLoading] = useState(true);
    const [isSupported, setIsSupported] = useState(false);

    useEffect(() => {
        // --- UPDATED --- First, check if Service Workers are supported at all
        if ('serviceWorker' in navigator && 'PushManager' in window) {
            setIsSupported(true);
            
            setPermissionStatus(Notification.permission);
            
            navigator.serviceWorker.ready.then(registration => {
                registration.pushManager.getSubscription().then(subscription => {
                    if (subscription) {
                        setIsSubscribed(true);
                    }
                    setLoading(false);
                });
            });
        } else {
            // If not supported, we can stop loading and show the appropriate message
            setIsSupported(false);
            setLoading(false);
        }
    }, []);
    
    const handleSubscribe = async () => {
        if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) {
            console.error('VAPID public key not found.');
            return;
        }

        const permission = await Notification.requestPermission();
        setPermissionStatus(permission);

        if (permission === 'granted') {
            try {
                const registration = await navigator.serviceWorker.ready;
                
                const subscription = await registration.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey: urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY),
                });

                if (supabase && userProfile) {
                    await supabase
                        .from('social_push_subscriptions')
                        .insert({
                            user_id: userProfile.user_id,
                            subscription: subscription,
                        });
                    setIsSubscribed(true);
                }
            } catch (error) {
                console.error('Error subscribing to push notifications:', error);
            }
        }
    };

    if (loading) {
        return <p>Loading notification settings...</p>;
    }

    // --- NEW --- Show a message if push notifications are not supported
    if (!isSupported) {
        return <p>Push notifications are not supported on this browser or connection.</p>;
    }

    if (permissionStatus === 'denied') {
        return <p>You have blocked notifications. You can enable them in your browser settings.</p>;
    }

    if (isSubscribed) {
        return <p>✅ Push notifications are enabled for this device.</p>;
    }

    return (
        <div>
            <p>Get notified of mentions and replies even when the app is closed.</p>
            <button onClick={handleSubscribe} className="submit-button">
                Enable Push Notifications
            </button>
        </div>
    );
}