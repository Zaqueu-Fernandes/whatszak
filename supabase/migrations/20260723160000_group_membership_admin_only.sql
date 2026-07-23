-- chat_participants_insert/_delete previously let ANY participant add or
-- remove ANY other member of a chat — no code path in the app actually
-- used this directly (membership only ever changes via the SECURITY
-- DEFINER create_private_chat/create_group_chat RPCs, which bypass RLS
-- entirely), but it was a real gap if anyone ever called the client SDK
-- directly. Now: adding/removing *other* members of a group requires
-- being an admin of that group; 1:1 chats keep their original
-- any-participant rule (the app doesn't manage 1:1 membership after
-- creation, so this branch is effectively dead code either way, kept only
-- to avoid a behavior change nobody asked for). Anyone can still remove
-- *themselves* (leave), even though there's no "leave group" button in
-- the UI yet.
DROP POLICY IF EXISTS "chat_participants_insert" ON public.chat_participants;
CREATE POLICY "chat_participants_insert" ON public.chat_participants FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM public.chats c
      WHERE c.id = chat_id
        AND (
          (c.is_group AND public.is_chat_admin(auth.uid(), chat_id))
          OR (NOT c.is_group AND public.is_chat_participant(auth.uid(), chat_id))
        )
    )
  );

DROP POLICY IF EXISTS "chat_participants_delete" ON public.chat_participants;
CREATE POLICY "chat_participants_delete" ON public.chat_participants FOR DELETE TO authenticated
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM public.chats c
      WHERE c.id = chat_id
        AND (
          (c.is_group AND public.is_chat_admin(auth.uid(), chat_id))
          OR (NOT c.is_group AND public.is_chat_participant(auth.uid(), chat_id))
        )
    )
  );
