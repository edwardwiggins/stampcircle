// pages/api/create-post.ts (or app/api/create-post/route.ts)
import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/app/lib/server-supabase';
import OpenAI from 'openai';

// Your OpenAI API Key is secure on the server
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(request: Request) {
    const supabase = await createServerSupabaseClient();
    const { data: { session } } = await supabase.auth.getSession();

    if (!session) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { content } = await request.json();

    if (!content) {
        return NextResponse.json({ error: 'Content is required' }, { status: 400 });
    }

    try {
        // Step 1: Moderate the content using the OpenAI Moderation API
        const moderationResponse = await openai.moderations.create({
            input: content,
        });

        const moderationResult = moderationResponse.results[0];
        if (moderationResult.flagged) {
            return NextResponse.json({
                error: 'Content flagged by moderation.',
                details: moderationResult.categories,
            }, { status: 403 });
        }

        // Step 2: Create an embedding using the OpenAI Embeddings API
        const embeddingResponse = await openai.embeddings.create({
            model: 'text-embedding-3-small',
            input: content,
        });

        const embedding = embeddingResponse.data[0].embedding;

        // Step 3: Insert the post and its embedding into the database
        const { data: insertedData, error: insertError } = await supabase
            .from('social_posts')
            .insert([{
                post_content: content,
                author_id: session.user.id,
                post_visibility: 1,
                post_embedding: embedding,
                post_type: 'User',
                post_status: 'Approved'
            }])
            .select('id') // We need the ID to fetch the full post object
            .single();

        if (insertError) {
            console.error('Database insertion error:', insertError);
            return NextResponse.json({ error: 'Failed to insert post.' }, { status: 500 });
        }

        // Step 4: Fetch the newly created post with all its consolidated data
        const { data, error } = await supabase
            .from('consolidated_social_posts')
            .select('*')
            .eq('post_id', insertedData.id)
            .single();

        if (error) {
            console.error('Database fetch error:', error);
            return NextResponse.json({ error: 'Failed to fetch new post data.' }, { status: 500 });
        }

        // Step 5: Return the complete post object to the client
        return NextResponse.json({ post: data }, { status: 201 });

    } catch (apiError: any) {
        console.error('API error:', apiError);
        return NextResponse.json({ error: 'Failed to process post with API.' }, { status: 500 });
    }
}