-- Admin-configurable app-wide settings: max upload size and media retention.
-- Singleton table (single row, id fixed at 1).
CREATE TABLE public.app_settings (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  max_file_size_mb INT NOT NULL DEFAULT 50 CHECK (max_file_size_mb > 0),
  media_retention_days INT CHECK (media_retention_days IS NULL OR media_retention_days > 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id)
);

INSERT INTO public.app_settings (id, max_file_size_mb, media_retention_days)
VALUES (1, 50, NULL);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- Every authenticated user needs to read this (to pre-check upload size
-- client-side before attempting an upload), but only admins can change it.
CREATE POLICY "Authenticated users can view app settings"
  ON public.app_settings FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can update app settings"
  ON public.app_settings FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_app_settings_updated_at
  BEFORE UPDATE ON public.app_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Keep the Storage bucket's own enforced limit in sync with the admin
-- setting, so oversized uploads are rejected server-side even if a client
-- ever skips the friendly pre-upload check.
CREATE OR REPLACE FUNCTION public.sync_media_bucket_file_size_limit()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE storage.buckets
  SET file_size_limit = NEW.max_file_size_mb * 1024 * 1024
  WHERE id = 'media';
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_app_settings_change_sync_bucket_limit
  AFTER INSERT OR UPDATE ON public.app_settings
  FOR EACH ROW EXECUTE FUNCTION public.sync_media_bucket_file_size_limit();

-- Apply the default limit to the bucket immediately (the trigger above only
-- fires on future inserts/updates, and INSERT already happened above it —
-- run it once explicitly here too).
UPDATE storage.buckets SET file_size_limit = 50 * 1024 * 1024 WHERE id = 'media';

-- Tracks messages whose media was auto-deleted by the retention job, so the
-- UI can show "Mídia expirada" instead of a broken image/link — distinct
-- from a user-initiated "Apagar para todos" (deleted_at).
ALTER TABLE public.messages ADD COLUMN media_expired_at TIMESTAMPTZ;
