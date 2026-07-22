import { supabase } from "@/integrations/supabase/client";

const SIGNED_URL_TTL_SECONDS = 3600;
// Re-sign a bit before actual expiry so a slow render never hands out a URL
// that dies moments later.
const CACHE_MARGIN_SECONDS = 300;

const cache = new Map<string, { url: string; expiresAt: number }>();

// Messages created before media_url stopped storing a pre-signed URL still
// have the full (likely expired) signed URL saved. Extract the underlying
// storage path from it so those old messages can be re-signed too, instead
// of staying permanently broken.
function extractStoragePath(value: string): string {
  const marker = "/object/sign/media/";
  const idx = value.indexOf(marker);
  if (idx === -1) return value;
  const rest = value.slice(idx + marker.length);
  const queryIdx = rest.indexOf("?");
  return decodeURIComponent(queryIdx === -1 ? rest : rest.slice(0, queryIdx));
}

export async function resolveMediaUrl(storedValue: string | null): Promise<string | null> {
  if (!storedValue) return null;
  const path = storedValue.startsWith("http") ? extractStoragePath(storedValue) : storedValue;

  const cached = cache.get(path);
  if (cached && cached.expiresAt > Date.now()) return cached.url;

  const { data, error } = await supabase.storage
    .from("media")
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);

  if (error || !data?.signedUrl) {
    console.error("[Media] Failed to sign URL for path:", path, error);
    // Best effort: if the stored value was already a URL, hand it back
    // rather than showing nothing (it may still work, e.g. not yet expired).
    return storedValue.startsWith("http") ? storedValue : null;
  }

  cache.set(path, {
    url: data.signedUrl,
    expiresAt: Date.now() + (SIGNED_URL_TTL_SECONDS - CACHE_MARGIN_SECONDS) * 1000,
  });
  return data.signedUrl;
}

export interface UserLimitProfile {
  maxFileSizeMb: number | null; // null = no limit
  mediaRetentionDays: number | null; // null = never expires by age
  autoDeleteOnView: boolean; // e.g. the "Privacidade" profile
}

const DEFAULT_LIMIT_PROFILE: UserLimitProfile = {
  maxFileSizeMb: 50,
  mediaRetentionDays: null,
  autoDeleteOnView: false,
};
const SETTINGS_CACHE_MS = 5 * 60 * 1000;
let limitProfileCache: { userId: string; profile: UserLimitProfile; fetchedAt: number } | null = null;

// limit_profiles/profiles.limit_profile_id aren't in the generated Supabase
// types yet (added via a manual migration, generated types need
// `supabase gen types` against the linked project to pick it up) — same
// `as any` pattern already used for push_tokens.
export async function getUserLimitProfile(userId: string): Promise<UserLimitProfile> {
  if (
    limitProfileCache &&
    limitProfileCache.userId === userId &&
    Date.now() - limitProfileCache.fetchedAt < SETTINGS_CACHE_MS
  ) {
    return limitProfileCache.profile;
  }

  const { data, error } = await supabase
    .from("profiles" as any)
    .select("limit_profiles ( max_file_size_mb, media_retention_days, auto_delete_on_view )")
    .eq("id", userId)
    .single();

  const raw = !error && data ? (data as any).limit_profiles : undefined;
  const profile: UserLimitProfile = raw
    ? {
        maxFileSizeMb: raw.max_file_size_mb,
        mediaRetentionDays: raw.media_retention_days,
        autoDeleteOnView: !!raw.auto_delete_on_view,
      }
    : DEFAULT_LIMIT_PROFILE;

  limitProfileCache = { userId, profile, fetchedAt: Date.now() };
  return profile;
}
