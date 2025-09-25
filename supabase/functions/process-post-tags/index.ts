// FILE: supabase/functions/process-post-tags/index.ts

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import OpenAI from 'https://esm.sh/openai@4.29.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Helper for BBCode tags: #[TagName](tag_id) or #[TagName](SUGGEST_NEW:TagName)
const extractBbCodeTags = (content: string): { name: string, id: string }[] => {
    if (!content) return [];
    const regex = /#\[([^\]]+)\]\(([^)]+)\)/g;
    const matches = [...content.matchAll(regex)];
    return matches.map(match => ({ name: match[1], id: match[2] }));
};

// Helper for plain text tags: #TagName
const extractPlainTextTags = (content: string): string[] => {
    if (!content) return [];
    const bbCodePlaceholder = 'BBCODE_TAG_PLACEHOLDER';
    const contentWithPlaceholders = content.replace(/#\[([^\]]+)\]\(([^)]+)\)/g, bbCodePlaceholder);
    const plainTextRegex = /(?<!\S)#(\w+)/g;
    const matches = [...contentWithPlaceholders.matchAll(plainTextRegex)];
    return matches.map(match => match[1]);
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const payload = await req.json();
    const record = payload.record;
    if (!record) throw new Error("Request payload is missing 'record'.");
    
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );
    
    const bbCodeTags = extractBbCodeTags(record.post_content);
    const plainTextTags = extractPlainTextTags(record.post_content);

    const approvedUserTags = bbCodeTags
        .filter(tag => !isNaN(Number(tag.id)))
        .map(tag => tag.name);
    
    const suggestedUserTags = bbCodeTags
        .filter(tag => tag.id.startsWith('SUGGEST_NEW:'))
        .map(tag => tag.id.split(':')[1]);

    const unverifiedPlainTextTags = plainTextTags;

    if (suggestedUserTags.length > 0) {
      const suggestionsToInsert = [...new Set(suggestedUserTags)].map(tagName => ({
        tag_name: tagName.toLowerCase(),
        suggested_by_user_id: record.author_id,
        status: 'pending',
      }));
      await supabaseClient.from('social_suggested_tags').insert(suggestionsToInsert);
    }
    
    const { data: existingTagsData } = await supabaseClient
      .from('social_tags')
      .select('tag_name')
      .eq('tag_status', 1)
      .eq('is_category', 0);
    const masterTagList = existingTagsData?.map(t => t.tag_name) || [];

    const allUserProvidedTags = [...new Set([...approvedUserTags, ...unverifiedPlainTextTags])];
    const cleanContentForAI = (record.post_content || '').replace(/#\[.*?\]\(.*?\)|#\w+/g, '').trim();

    if (cleanContentForAI.length === 0 && allUserProvidedTags.length === 0) {
        return new Response(JSON.stringify({ message: 'Post is empty, no tags.' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
    }

    const openai = new OpenAI({ apiKey: Deno.env.get('OPENAI_API_KEY')! });
    const prompt = `
      You are an intelligent content curator for a philatelic social network. A user has submitted a post. Your job is to return a final, clean list of up to 5 relevant and approved hashtags.

      CONTEXT:
      - Master Tag List (already approved): ${JSON.stringify(masterTagList)}
      - Post Content: "${cleanContentForAI}"
      - User's Provided Tags: ${JSON.stringify(allUserProvidedTags)}

      YOUR TASKS:
      1.  If the user provided tags, start with their list. Your main goal is to respect their choices if they are relevant.
      2.  For each user tag, check if a semantically similar tag exists in the "Master Tag List". If a strong match exists, substitute it with the version from the master list (e.g., if user provides "USAStamps" and master list has "UnitedStates", use "UnitedStates").
      3.  Remove any user tags that are completely irrelevant to the "Post Content".
      4.  If the user provided NO tags, analyze the "Post Content" and select up to 5 of the most relevant tags from the "Master Tag List".
      5.  Only if no tag from the master list is a good fit for a concept in the text, you may generate a new, appropriate, non-offensive tag. New tags must be in PascalCase.
      6.  Return a final JSON object with a single key "hashtags" containing the final array of tag strings.

      RESPONSE FORMAT: {"hashtags": ["TagName1", "TagName2"]}
    `;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
    });
    
    let finalHashtags: string[] = [];
    const aiContent = response.choices[0].message.content;
    if (aiContent) {
        const aiResponse = JSON.parse(aiContent);
        if (Array.isArray(aiResponse.hashtags)) {
          finalHashtags = aiResponse.hashtags;
        }
    }
    
    const tagIds: number[] = [];
    for (const tagName of [...new Set(finalHashtags)].slice(0, 5)) {
      const cleanTagName = tagName.toLowerCase();
      const { data: existingTag } = await supabaseClient.from('social_tags').select('id').eq('tag_name', cleanTagName).limit(1).single();
      if (existingTag) {
        tagIds.push(existingTag.id);
      } else {
        const { data: newTag } = await supabaseClient.from('social_tags').insert({ tag_name: cleanTagName, tag_displayname: `#${tagName}`, tag_status: 1, is_category: 0 }).select('id').single();
        if (newTag) tagIds.push(newTag.id);
      }
    }
    
    await supabaseClient.from('social_post_tags').delete().eq('post_id', record.id);
    if (tagIds.length > 0) {
        const newTagAssociations = tagIds.map(tagId => ({ post_id: record.id, tag_id: tagId }));
        await supabaseClient.from('social_post_tags').insert(newTagAssociations);
    }
    
    const cleanedContentForStorage = (record.post_content || '').replace(/#\[([^\]]+)\]\(([^)]+)\)/g, '').replace(/(?<!\S)#(\w+)/g, '').trim();
    
    // --- THIS IS THE FIX ---
    // Update the post content AND set tags_processed to true to prevent the trigger from firing again.
    await supabaseClient.from('social_posts').update({ 
      post_content: cleanedContentForStorage,
      tags_processed: true 
    }).eq('id', record.id);
    
    return new Response(JSON.stringify({ message: `Successfully processed post ${record.id}` }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200,
    });

  } catch (error) {
    console.error('Error in Edge Function:', error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500,
    });
  }
});