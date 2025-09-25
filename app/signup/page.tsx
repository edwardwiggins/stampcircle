// app/signup/page.tsx

'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import supabase from '@/app/lib/client-supabase';
import { useRouter } from 'next/navigation';
import '@/app/styles/auth-form.css';

// --- NEW HELPER FUNCTION ---
const capitalizeName = (name: string) => {
    if (!name) return '';
    return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
};

export default function SignUpPage() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [username, setUsername] = useState('');
    const [suburb, setSuburb] = useState('');
    const [city, setCity] = useState('');
    const [country, setCountry] = useState('');

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [message, setMessage] = useState<string | null>(null);

    // State for real-time username availability check
    const [usernameStatus, setUsernameStatus] = useState<'idle' | 'checking' | 'available' | 'unavailable'>('idle');
    const [debouncedUsername, setDebouncedUsername] = useState(username);
    
    const router = useRouter();

    // Debounce the username input
    useEffect(() => {
        const handler = setTimeout(() => {
            setDebouncedUsername(username);
        }, 500);

        return () => {
            clearTimeout(handler);
        };
    }, [username]);

    // Check username availability
    useEffect(() => {
        if (debouncedUsername.trim().length < 3) {
            setUsernameStatus('idle');
            return;
        }

        const checkUsername = async () => {
            setUsernameStatus('checking');
            const { data, error } = await supabase.rpc('check_username_exists', {
                p_username: debouncedUsername,
            });

            if (error) {
                console.error('Error checking username:', error);
                setUsernameStatus('idle');
            } else {
                setUsernameStatus(data ? 'unavailable' : 'available');
            }
        };

        checkUsername();
    }, [debouncedUsername, supabase]);


    const handleSignUp = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setMessage(null);
        setLoading(true);

        if (usernameStatus !== 'available') {
            setError('Please choose an available username.');
            setLoading(false);
            return;
        }

        // --- THIS IS THE FIX ---
        // Capitalize names before sending them to the server
        const formattedFirstName = capitalizeName(firstName);
        const formattedLastName = capitalizeName(lastName);
        const finalDisplayName = `${formattedFirstName} ${formattedLastName}`.trim();

        const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: {
                data: {
                    firstName: formattedFirstName,
                    lastName: formattedLastName,
                    displayName: finalDisplayName, 
                    username,
                    suburb,
                    city,
                    country,
                },
            },
        });

        if (error) {
            setError(error.message);
        } else if (data.user) {
            setMessage('Success! Please check your email to confirm your account.');
        }

        setLoading(false);
    };

    return (
        <div className="auth-container">
            <form onSubmit={handleSignUp} className="auth-form">
                <h1>Create Account</h1>

                <div className="input-group">
                    <label htmlFor="firstName">First Name</label>
                    <input id="firstName" type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
                </div>
                <div className="input-group">
                    <label htmlFor="lastName">Last Name</label>
                    <input id="lastName" type="text" value={lastName} onChange={(e) => setLastName(e.target.value)} required />
                </div>
                <div className="input-group">
                    <label htmlFor="username">Username</label>
                    <input id="username" type="text" value={username} onChange={(e) => setUsername(e.target.value.toLowerCase())} required />
                    <div className={`username-check ${usernameStatus}`}>
                        {usernameStatus === 'checking' && 'Checking availability...'}
                        {usernameStatus === 'available' && 'Username is available!'}
                        {usernameStatus === 'unavailable' && 'Username is already taken.'}
                    </div>
                </div>
                <div className="input-group">
                    <label htmlFor="email">Email</label>
                    <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                </div>
                <div className="input-group">
                    <label htmlFor="password">Password</label>
                    <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
                </div>
                <div className="input-group">
                    <label htmlFor="country">Country</label>
                    <input id="country" type="text" value={country} onChange={(e) => setCountry(e.target.value)} />
                </div>
                <div className="input-group">
                    <label htmlFor="city">City / Town</label>
                    <input id="city" type="text" value={city} onChange={(e) => setCity(e.target.value)} />
                </div>
                <div className="input-group">
                    <label htmlFor="suburb">Suburb</label>
                    <input id="suburb" type="text" value={suburb} onChange={(e) => setSuburb(e.target.value)} />
                </div>

                <button type="submit" className="submit-button" disabled={loading || usernameStatus !== 'available'}>
                    {loading ? 'Signing Up...' : 'Sign Up'}
                </button>

                {error && <p className="error-message">{error}</p>}
                {message && <p className="text-green-500 mt-4 text-center">{message}</p>}

                <p className="auth-link">
                    Already have an account? <Link href="/login">Log In</Link>
                </p>
            </form>
        </div>
    );
}