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

    // Retention is per-user (via their limit profile), not a single global
    // value, so compute a cutoff date per profile instead of one for everyone.
    const { data: limitProfiles, error: profilesError } = await adminClient
      .from("limit_profiles")
      .select("id, media_retention_days");
    if (profilesError) {
      throw new Error(`Failed to load limit_profiles: ${profilesError.message}`);
    }

    const cutoffByProfileId = new Map<string, string>();
    for (const p of limitProfiles ?? []) {
      if (p.media_retention_days) {
        cutoffByProfileId.set(
          p.id,
          new Date(Date.now() - p.media_retention_days * 24 * 60 * 60 * 1000).toISOString()
        );
      }
    }

    if (cutoffByProfileId.size === 0) {
      console.log("[cleanup-expired-media] No profile has retention configured, skipping.");
      return new Response(JSON.stringify({ expired: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: userProfiles, error: userProfilesError } = await adminClient
      .from("profiles")
      .select("id, limit_profile_id");
    if (userProfilesError) {
      throw new Error(`Failed to load profiles: ${userProfilesError.message}`);
    }
    const limitProfileIdByUserId = new Map(
      (userProfiles ?? []).map((u) => [u.id, u.limit_profile_id as string | null])
    );

    const { data: candidates, error: fetchError } = await adminClient
      .from("messages")
      .select("id, sender_id, media_url, created_at")
      .not("media_url", "is", null)
      .is("media_expired_at", null)
      .is("deleted_at", null);
    if (fetchError) {
      throw new Error(`Failed to query candidate messages: ${fetchError.message}`);
    }

    const expired = (candidates ?? []).filter((m) => {
      const limitProfileId = limitProfileIdByUserId.get(m.sender_id);
      if (!limitProfileId) return false;
      const cutoff = cutoffByProfileId.get(limitProfileId);
      if (!cutoff) return false; // that user's profile has no retention set
      return m.created_at < cutoff;
    });

    if (expired.length === 0) {
      console.log("[cleanup-expired-media] Nothing to expire.");
      return new Response(JSON.stringify({ expired: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const paths = expired
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
      .in("id", expired.map((m) => m.id));
    if (updateError) {
      throw new Error(`Failed to mark messages expired: ${updateError.message}`);
    }

    console.log(`[cleanup-expired-media] Expired ${expired.length} message(s).`);
    return new Response(JSON.stringify({ expired: expired.length }), {
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
