// app/page.tsx
import FeedContainer from './components/FeedContainer';
import { createServerSupabaseClient } from '@/app/lib/server-supabase';
import { redirect } from 'next/navigation';
import { UserProvider } from './context/user-context';
import { SlHome, SlPeople, SlBubbles, SlPieChart, SlBell } from "react-icons/sl";
import { cookies } from 'next/headers';
import LogoutButton from './components/LogoutButton';

export default async function Home() {
    const supabase = createServerSupabaseClient();
    const { data: { session } } = await supabase.auth.getSession();

    if (!session) {
        redirect('/login');
    }

    return (
        <UserProvider initialSession={session}>
            <main>
                <header>
                    <div className='header-left'>
                        <h1>StampCircle</h1>
                    </div>
                    <div className='header-middle'>
                        <div className='topmenu'><SlHome className='icon' size={30} /></div>
                        <div className='topmenu'><SlPeople className='icon' size={30} /></div>
                        <div className='topmenu'><SlBubbles className='icon' size={30} /></div>
                        <div className='topmenu'><SlPieChart className='icon' size={30} /></div>
                    </div>
                    <div className='header-right'>
                        <div className='topmenu-right'><SlBell className='icon' size={30} /></div>
                        <div className='topmenu-right'><img className='avatar' src='/default-avatar.jpg' alt="Avatar"></img></div>
                        <LogoutButton />
                    </div>
                </header>
                <div className='container'>
                    <aside className='left-sidebar'>
                        <h2>Navigation</h2>
                    </aside>
                    <div className='content'>
                        <FeedContainer />
                    </div>
                    <aside className='right-sidebar'>
                        <h2>Extras</h2>
                        <p>Friends, Ads, or Suggested Content</p>
                    </aside>
                </div>
                <footer>
                    <p>© 2025 StampCircle</p>
                </footer>
            </main>
        </UserProvider>
    );
}