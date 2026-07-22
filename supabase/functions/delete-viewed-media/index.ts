import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Same extraction helper used elsewhere: media_url is normally a raw Storage
// path, but older rows may still hold a full (possibly expired) signed URL.
function extractStoragePath(value: string): string {
  const marker = "/object/sign/media/";
  const idx = value.indexOf(marker);
  if (idx === -1) return value;
  const rest = value.slice(idx + marker.length);
  const queryIdx = rest.indexOf("?");
  return decodeURIComponent(queryIdx === -1 ? rest : rest.slice(0, queryIdx));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claims, error: claimsError } = await userClient.auth.getUser();
    if (claimsError || !claims.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const viewerId = claims.user.id;

    const { message_id } = await req.json();
    if (!message_id) {
      return new Response(JSON.stringify({ error: "Missing message_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: message, error: messageError } = await adminClient
      .from("messages")
      .select("id, chat_id, media_url, view_once, viewed_at, deleted_at")
      .eq("id", message_id)
      .single();

    if (messageError || !message) {
      return new Response(JSON.stringify({ error: "Message not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Only a real chat participant can trigger this — a stranger with a
    // guessed message_id shouldn't be able to nuke someone else's media.
    const { data: isParticipant } = await adminClient.rpc("is_chat_participant", {
      _user_id: viewerId,
      _chat_id: message.chat_id,
    });
    if (!isParticipant) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!message.view_once || !message.media_url || message.deleted_at) {
      // Nothing to delete (not a view-once message, already cleared, or
      // the message itself was deleted) — treat as a no-op success so the
      // client doesn't need to special-case it.
      return new Response(JSON.stringify({ deleted: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const path = extractStoragePath(message.media_url);
    const { error: removeError } = await adminClient.storage.from("media").remove([path]);
    if (removeError) {
      console.error("[delete-viewed-media] Storage removal error:", removeError.message);
    }

    const { error: updateError } = await adminClient
      .from("messages")
      .update({ media_url: null, viewed_at: message.viewed_at ?? new Date().toISOString() })
      .eq("id", message_id);

    if (updateError) {
      throw new Error(`Failed to update message: ${updateError.message}`);
    }

    return new Response(JSON.stringify({ deleted: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[delete-viewed-media] error:", error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
