-- Security fix: the original "Chat participants can view media" policy
-- (20260216212100_..._sql) never actually checked chat participation —
-- its USING clause was just `bucket_id = 'media'`, so any authenticated
-- user could read any file in the bucket by guessing/learning its path
-- (uploader_id/chat_id/timestamp.ext), regardless of whether they belong
-- to that chat. This undermined per-chat privacy and the "Privacidade"
-- view-once profile's whole point (permanent out-of-band access).
--
-- Media paths are always `{uploader_id}/{chat_id}/{filename}` (see
-- ChatScreen.tsx handleFileSelected/handleAudioRecorded), so participation
-- can be checked directly from the path without joining messages — this
-- also still works for legacy rows whose messages.media_url column stores
-- a full (possibly expired) signed URL instead of the raw path.
DROP POLICY IF EXISTS "Chat participants can view media" ON storage.objects;

CREATE POLICY "Chat participants can view media"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'media'
    AND (
      auth.uid()::text = (storage.foldername(name))[1]
      OR (
        array_length(storage.foldername(name), 1) >= 2
        AND public.is_chat_participant(auth.uid(), ((storage.foldername(name))[2])::uuid)
      )
    )
  );
