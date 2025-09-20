// app/components/Login.tsx

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
// --- UPDATED --- Import the shared client instance directly
import supabase from '@/app/lib/client-supabase';
import '@/app/styles/auth-form.css';

export default function Login() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    
    const router = useRouter();
    // --- REMOVED --- The line below is no longer needed as we import the client directly
    // const supabase = createClientSupabaseClient();

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setLoading(true);

        const { error } = await supabase.auth.signInWithPassword({
            email,
            password,
        });

        if (error) {
            setError(error.message);
        } else {
            // Force a page reload to re-run the server-side auth check
            // and redirect to the main feed.
            router.refresh();
        }

        setLoading(false);
    };

    return (
        <div className="auth-container">
            <form onSubmit={handleLogin} className="auth-form">
                <h1>Welcome Back</h1>

                <div className="input-group">
                    <label htmlFor="email">Email</label>
                    <input 
                        id="email" 
                        type="email" 
                        value={email} 
                        onChange={(e) => setEmail(e.target.value)} 
                        required 
                    />
                </div>
                <div className="input-group">
                    <label htmlFor="password">Password</label>
                    <input 
                        id="password" 
                        type="password" 
                        value={password} 
                        onChange={(e) => setPassword(e.target.value)} 
                        required 
                    />
                </div>

                <button type="submit" className="submit-button" disabled={loading}>
                    {loading ? 'Logging In...' : 'Log In'}
                </button>

                {error && <p className="error-message">{error}</p>}

                <p className="auth-link">
                    Don't have an account? <Link href="/signup">Sign Up</Link>
                </p>
            </form>
        </div>
    );
}