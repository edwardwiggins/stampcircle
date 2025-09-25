// supabase/functions/handle-connection-accepted/index.ts

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // The trigger sends the OLD record, which contains the original requester
    const { record: connection } = await req.json();

    // Send a notification to the user who INITIALLY sent the request
    const { error } = await supabaseAdmin
      .from('social_user_notifications')
      .insert({
        receiving_user_id: connection.user_id, // The original sender
        last_sending_user_id: connection.target_user_id, // The user who accepted
        notification_type: 'connection_accepted',
        entity_type: 'user',
        data: {
          connection_id: connection.id,
        },
      });

    if (error) throw error;

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (err) {
    return new Response(String(err?.message ?? err), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});