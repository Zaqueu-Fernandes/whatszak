-- Replace the single global app-wide file size/retention setting with
-- per-user "limit profiles" (Básico/Premium/Ilimitado), each independently
-- configurable by an admin.
DROP TRIGGER IF EXISTS on_app_settings_change_sync_bucket_limit ON public.app_settings;
DROP FUNCTION IF EXISTS public.sync_media_bucket_file_size_limit();
DROP TABLE IF EXISTS public.app_settings;

CREATE TABLE public.limit_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  max_file_size_mb INT CHECK (max_file_size_mb IS NULL OR max_file_size_mb > 0), -- NULL = no limit
  media_retention_days INT CHECK (media_retention_days IS NULL OR media_retention_days > 0), -- NULL = never expire
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.limit_profiles ENABLE ROW LEVEL SECURITY;

-- Every authenticated user needs to read this (to pre-check their own
-- upload size limit client-side), but only admins can change the profiles.
CREATE POLICY "Authenticated users can view limit profiles"
  ON public.limit_profiles FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can update limit profiles"
  ON public.limit_profiles FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_limit_profiles_updated_at
  BEFORE UPDATE ON public.limit_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Supabase Storage only supports a single file_size_limit per bucket, not
-- one per user/profile, so the bucket-level (real, server-enforced) cap
-- tracks the loosest configured profile — NULL (no cap) if any profile is
-- "unlimited", otherwise the largest max_file_size_mb among all profiles.
-- Tighter profiles (e.g. Básico) are enforced client-side before upload.
CREATE OR REPLACE FUNCTION public.sync_media_bucket_file_size_limit()
RETURNS TRIGGER AS $$
DECLARE
  computed_limit BIGINT;
BEGIN
  SELECT
    CASE
      WHEN bool_or(max_file_size_mb IS NULL) THEN NULL
      ELSE MAX(max_file_size_mb) * 1024 * 1024
    END
  INTO computed_limit
  FROM public.limit_profiles;

  UPDATE storage.buckets SET file_size_limit = computed_limit WHERE id = 'media';
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_limit_profiles_change_sync_bucket_limit
  AFTER INSERT OR UPDATE OR DELETE ON public.limit_profiles
  FOR EACH ROW EXECUTE FUNCTION public.sync_media_bucket_file_size_limit();

INSERT INTO public.limit_profiles (name, max_file_size_mb, media_retention_days) VALUES
  ('Básico', 25, 30),
  ('Premium', 100, 90),
  ('Ilimitado', NULL, NULL);

-- Every user belongs to a limit profile; new signups default to "Básico".
CREATE OR REPLACE FUNCTION public.default_limit_profile_id()
RETURNS UUID
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT id FROM public.limit_profiles WHERE name = 'Básico' LIMIT 1;
$$;

ALTER TABLE public.profiles
  ADD COLUMN limit_profile_id UUID REFERENCES public.limit_profiles(id)
  DEFAULT public.default_limit_profile_id();

UPDATE public.profiles SET limit_profile_id = public.default_limit_profile_id()
WHERE limit_profile_id IS NULL;

-- Note: admins updating another user's limit_profile_id is already covered
-- by the existing "profiles_update_admin" policy (has_role(auth.uid(), 'admin')).
