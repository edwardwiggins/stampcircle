import { NextResponse } from 'next/server';

// This API route is dedicated solely to moderating comment content.
export async function POST(req: Request) {
    try {
        // 1. Get the comment content from the client app.
        const { content } = await req.json();

        if (!content) {
            return NextResponse.json({ error: 'Content is required' }, { status: 400 });
        }

        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) {
            // This is a server-side error, so we don't expose the reason to the client.
            throw new Error('OpenAI API key not found on the server.');
        }

        // 2. Make the secure, server-to-server call to the OpenAI Moderation API.
        const moderationResponse = await fetch('https://api.openai.com/v1/moderations', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({ input: content })
        });

        if (!moderationResponse.ok) {
            throw new Error(`OpenAI Moderation API error: ${moderationResponse.statusText}`);
        }

        const moderationResult = await moderationResponse.json();
        const isFlagged = moderationResult.results[0].flagged;
        
        // 3. Return the simple true/false result to our client app.
        return NextResponse.json({ isFlagged });

    } catch (error: any) {
        // Log the full error on the server for debugging.
        console.error('Error in comment moderation API route:', error);
        // Return a generic error message to the client.
        return NextResponse.json({ error: "Failed to process comment moderation." }, { status: 500 });
    }
}
