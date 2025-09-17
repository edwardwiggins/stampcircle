import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  // 1. Get the event data from the request body.
  const { event_name, properties } = await request.json();

  if (!event_name) {
    return NextResponse.json({ error: 'event_name is required' }, { status: 400 });
  }

  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
      },
    }
  );

  try {
    // 2. Get the current user's session from the cookies.
    const { data: { user } } = await supabase.auth.getUser();

    // 3. Prepare the event object to be saved.
    const eventToInsert = {
      event_name,
      properties,
      user_id: user?.id, // Will be null if the user is not logged in
    };

    // 4. Insert the event into the database.
    const { error } = await supabase.from('analytics_events').insert(eventToInsert);

    if (error) {
      // If there's a database error, log it on the server and return an error.
      console.error('Error inserting analytics event:', error);
      return NextResponse.json({ error: 'Failed to save event' }, { status: 500 });
    }

    // 5. Return a success response.
    return NextResponse.json({ message: 'Event tracked successfully' }, { status: 201 });

  } catch (error) {
    console.error('Unexpected error in track-event API:', error);
    return NextResponse.json({ error: 'An unexpected error occurred' }, { status: 500 });
  }
}