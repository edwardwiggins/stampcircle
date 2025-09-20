// app/test-broadcast/page.tsx

'use client';

import { useState, useEffect } from 'react';
import { useUser } from '../context/user-context';
import { RealtimeChannel } from '@supabase/supabase-js';

export default function TestBroadcastPage() {
    const { supabase } = useUser();
    const [status, setStatus] = useState('Not connected');
    const [receivedMessage, setReceivedMessage] = useState<any | null>(null);
    const channelName = 'test-channel';

    useEffect(() => {
        if (!supabase) return;

        console.log(`Attempting to subscribe to channel: ${channelName}`);
        
        const channel: RealtimeChannel = supabase.channel(
            channelName,
            { config: { broadcast: { self: true } } }
        );

        channel.on('broadcast', { event: 'test-event' }, (payload) => {
            console.log('>>> BROADCAST RECEIVED:', payload);
            setReceivedMessage(payload);
        });

        channel.subscribe((status, err) => {
            setStatus(status);
            if (err) {
                console.error('Subscription error:', err);
            }
        });

        // Cleanup
        return () => {
            supabase.removeChannel(channel);
        };

    }, [supabase]);

    return (
        <div style={{ padding: '40px', fontFamily: 'sans-serif' }}>
            <h1>Realtime Broadcast Test</h1>
            <p>This page is subscribed to a channel named: <strong>{channelName}</strong></p>
            <p>Subscription Status: <strong>{status}</strong></p>
            <hr style={{ margin: '20px 0' }} />
            <div>
                <h2>Received Message:</h2>
                {receivedMessage ? (
                    <pre style={{ backgroundColor: '#f0f0f0', padding: '10px', borderRadius: '5px' }}>
                        {JSON.stringify(receivedMessage, null, 2)}
                    </pre>
                ) : (
                    <p>Waiting for a broadcast message with the event name 'test-event'...</p>
                )}
            </div>
        </div>
    );
}