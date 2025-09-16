import { NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: Request) {
  try {
    // **UPDATED**: Destructure `type` from the request body
    const { content, type } = await req.json();

    if (!content) {
      return NextResponse.json({ error: 'Content is required' }, { status: 400 });
    }

    const moderationResult = await openai.moderations.create({
      input: content,
    });
    const isFlagged = moderationResult.results[0].flagged;
    
    let embedding = null;

    // **UPDATED**: Only generate embeddings if the content is not flagged AND the type is 'post'
    if (!isFlagged && type === 'post') {
        const embeddingResult = await openai.embeddings.create({
            input: content,
            model: 'text-embedding-3-small',
        });
        embedding = embeddingResult.data[0].embedding;
    }
    
    return NextResponse.json({ 
        isFlagged, 
        embedding, 
        moderationData: moderationResult.results[0]
    });

  } catch (error: any) {
    console.error('Error in content processing API route:', error);
    return NextResponse.json({ 
      error: error.message,
      isFlagged: true,
      embedding: null,
      moderationData: { error: 'Content processing service failed' }
    }, { status: 500 });
  }
}