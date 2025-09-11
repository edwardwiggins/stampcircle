// app/login/page.tsx
import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '../lib/server-supabase';
import Login from '../components/Login';

export default async function LoginPage() {
  const supabase = await createServerSupabaseClient(); // Add 'await' here
  const { data: { session } } = await supabase.auth.getSession();

  if (session) {
    redirect('/');
  }

  return <Login />;
}