-- Lets group chats have their own photo, editable from the chat header
-- (see GroupSettingsDialog.tsx). 1:1 chats keep showing the other user's
-- own profiles.avatar_url instead — this column is only ever set for
-- is_group=true rows.
ALTER TABLE public.chats ADD COLUMN avatar_url text;

-- chats_update already permits any participant to update the row
-- (public.is_chat_participant(auth.uid(), id)) — no new policy needed,
-- consistent with this app having no separate "group admin" concept yet.
