// app/components/PushNotificationManager.tsx

'use client';

import { useState, useEffect } from 'react';
import { useUser } from '@/app/context/user-context';

function urlBase64ToUint8Array(base64String: string) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
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
        const setupPushNotifications = async () => {
            if ('serviceWorker' in navigator && 'PushManager' in window) {
                setIsSupported(true);
                setPermissionStatus(Notification.permission);

                try {
                    const registration = await navigator.serviceWorker.register('/sw.js');
                    const subscription = await registration.pushManager.getSubscription();
                    if (subscription) {
                        setIsSubscribed(true);
                    }
                } catch (error) {
                    console.error('Service Worker or subscription error:', error);
                } finally {
                    setLoading(false);
                }
            } else {
                setIsSupported(false);
                setLoading(false);
            }
        };
        setupPushNotifications();
    }, []);
    
    const handleSubscribe = async () => {
        if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || !supabase || !userProfile) {
            console.error('VAPID key, Supabase client, or user profile not available.');
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
                
                // --- UPDATED LOGIC TO PREVENT DUPLICATES ---
                const { data: existingSubscription, error: checkError } = await supabase
                    .from('social_push_subscriptions')
                    .select('id')
                    .eq('user_id', userProfile.user_id)
                    // The 'endpoint' is a unique URL for the browser/device combination
                    .eq('subscription->>endpoint', subscription.endpoint)
                    .maybeSingle();
                
                if (checkError) throw checkError;

                // Only insert if this exact subscription doesn't already exist
                if (!existingSubscription) {
                    await supabase
                        .from('social_push_subscriptions')
                        .insert({
                            user_id: userProfile.user_id,
                            subscription: subscription,
                        });
                }
                
                setIsSubscribed(true);
            } catch (error) {
                console.error('Error subscribing to push notifications:', error);
            }
        }
    };

    return (
        <div>
            <p>Get notified of mentions and replies even when the app is closed.</p>
            <button onClick={handleSubscribe} className="submit-button">
                Enable Push Notifications
            </button>
        </div>
    );
}