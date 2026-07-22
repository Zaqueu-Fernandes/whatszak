import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// messages.media_url stores the raw Storage path for messages sent after the
// signed-URL-expiry fix, but older rows may still hold a full (likely
// already-expired) signed URL — extract the underlying path either way.
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
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: settings, error: settingsError } = await adminClient
      .from("app_settings")
      .select("media_retention_days")
      .eq("id", 1)
      .single();

    if (settingsError) {
      throw new Error(`Failed to load app_settings: ${settingsError.message}`);
    }

    const retentionDays = settings?.media_retention_days;
    if (!retentionDays) {
      console.log("[cleanup-expired-media] No retention configured, skipping.");
      return new Response(JSON.stringify({ message: "Retention disabled, nothing to do" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString();
    console.log(`[cleanup-expired-media] Retention: ${retentionDays} days, cutoff: ${cutoff}`);

    const { data: expiredMessages, error: fetchError } = await adminClient
      .from("messages")
      .select("id, media_url")
      .not("media_url", "is", null)
      .is("media_expired_at", null)
      .is("deleted_at", null)
      .lt("created_at", cutoff);

    if (fetchError) {
      throw new Error(`Failed to query expired messages: ${fetchError.message}`);
    }

    if (!expiredMessages || expiredMessages.length === 0) {
      console.log("[cleanup-expired-media] Nothing to expire.");
      return new Response(JSON.stringify({ expired: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const paths = expiredMessages
      .map((m) => (m.media_url ? extractStoragePath(m.media_url) : null))
      .filter((p): p is string => !!p);

    if (paths.length > 0) {
      const { error: removeError } = await adminClient.storage.from("media").remove(paths);
      if (removeError) {
        console.error("[cleanup-expired-media] Storage removal error:", removeError.message);
      }
    }

    const now = new Date().toISOString();
    const { error: updateError } = await adminClient
      .from("messages")
      .update({ media_url: null, media_expired_at: now })
      .in("id", expiredMessages.map((m) => m.id));

    if (updateError) {
      throw new Error(`Failed to mark messages expired: ${updateError.message}`);
    }

    console.log(`[cleanup-expired-media] Expired ${expiredMessages.length} message(s).`);
    return new Response(JSON.stringify({ expired: expiredMessages.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[cleanup-expired-media] error:", error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
