// app/(main)/profile/[username]/page.tsx

import { createServerSupabaseClient } from '@/app/lib/server-supabase';
import { notFound } from 'next/navigation';
// --- NEW --- Import the new client component
import ProfileClient from './ProfileClient';

interface ProfilePageProps {
  params: {
    username: string;
  };
}

export default async function ProfilePage({ params }: ProfilePageProps) {
  const supabase = createServerSupabaseClient();
  const { username } = params;

  const { data: userProfile, error } = await supabase
    .from('user_profile')
    .select('*')
    .eq('username', username)
    .single();

  if (error || !userProfile) {
    notFound();
  }
  
  // The page now just fetches data and passes it to the client component
  return <ProfileClient profile={userProfile} />;
}