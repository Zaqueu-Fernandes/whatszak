-- Add a profile-level "auto view-once" flag: every media message sent by a
-- user on a profile with this enabled behaves like a manually-toggled
-- view_once message (blurred until opened, deleted right after), without the
-- sender choosing it per message.
ALTER TABLE public.limit_profiles ADD COLUMN auto_delete_on_view BOOLEAN NOT NULL DEFAULT false;

INSERT INTO public.limit_profiles (name, max_file_size_mb, media_retention_days, auto_delete_on_view)
VALUES ('Privacidade', 25, NULL, true);
