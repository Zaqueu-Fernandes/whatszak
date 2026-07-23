-- Group admin roles. Until now any participant could rename/re-photo a
-- group; the user asked for that to be admin-only, with an initial admin
-- promoted on existing groups and new groups admin'd by their creator.
ALTER TABLE public.chat_participants ADD COLUMN is_admin boolean NOT NULL DEFAULT false;
-- Lets admins lock a group so only admins can send messages (like
-- WhatsApp's "somente administradores" group setting) — a group-wide
-- toggle, not a per-member kick/mute.
ALTER TABLE public.chats ADD COLUMN only_admins_can_message boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.is_chat_admin(_user_id uuid, _chat_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.chat_participants
    WHERE user_id = _user_id AND chat_id = _chat_id AND is_admin = true
  )
$$;

-- Backfill: there was no admin concept before this migration, so every
-- existing group would otherwise end up with zero admins (permanently
-- unmanageable). Promote the app owner's account on every existing group
-- they're already a member of.
UPDATE public.chat_participants cp
SET is_admin = true
FROM public.chats c, auth.users u
WHERE cp.chat_id = c.id
  AND c.is_group = true
  AND cp.user_id = u.id
  AND u.email = 'zaqueufernandes@gmail.com';

-- New groups: the creator is admin from the start (mirrors the backfill
-- intent for every group created going forward).
CREATE OR REPLACE FUNCTION public.create_group_chat(_name text, _participant_ids uuid[])
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _chat_id uuid;
  _current_user_id uuid := auth.uid();
  _participant_id uuid;
BEGIN
  IF _current_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF _name IS NULL OR btrim(_name) = '' THEN
    RAISE EXCEPTION 'Group name is required';
  END IF;

  IF _participant_ids IS NULL OR array_length(_participant_ids, 1) IS NULL OR array_length(_participant_ids, 1) < 1 THEN
    RAISE EXCEPTION 'At least one other participant is required';
  END IF;

  INSERT INTO chats (is_group, name, created_by)
  VALUES (true, btrim(_name), _current_user_id)
  RETURNING id INTO _chat_id;

  INSERT INTO chat_participants (chat_id, user_id, is_admin) VALUES (_chat_id, _current_user_id, true);

  FOREACH _participant_id IN ARRAY _participant_ids LOOP
    IF _participant_id <> _current_user_id THEN
      INSERT INTO chat_participants (chat_id, user_id)
      VALUES (_chat_id, _participant_id)
      ON CONFLICT (chat_id, user_id) DO NOTHING;
    END IF;
  END LOOP;

  RETURN _chat_id;
END;
$$;

-- Only admins can edit group info (name/avatar_url/only_admins_can_message)
-- now. 1:1 chats are never updated by the app today, but keep their
-- original any-participant rule for that branch so this doesn't quietly
-- change unrelated behavior.
DROP POLICY IF EXISTS "chats_update" ON public.chats;
CREATE POLICY "chats_update" ON public.chats FOR UPDATE TO authenticated
  USING (
    CASE WHEN is_group THEN public.is_chat_admin(auth.uid(), id)
         ELSE public.is_chat_participant(auth.uid(), id)
    END
  );

-- Enforce the "only admins can message" lock server-side too (not just via
-- the UI graying out the composer), so it can't be bypassed by sending a
-- raw insert while the group is locked.
DROP POLICY IF EXISTS "messages_insert" ON public.messages;
CREATE POLICY "messages_insert" ON public.messages FOR INSERT TO authenticated
  WITH CHECK (
    (auth.uid() = sender_id)
    AND public.is_chat_participant(auth.uid(), chat_id)
    AND (
      NOT COALESCE((SELECT only_admins_can_message FROM public.chats WHERE id = chat_id), false)
      OR public.is_chat_admin(auth.uid(), chat_id)
    )
  );

-- Promoting/demoting admins: a SECURITY DEFINER RPC rather than a broad
-- UPDATE policy on chat_participants (which has none today) — keeps "only
-- an existing admin can grant/revoke admin" as one explicit, auditable
-- check instead of a harder-to-reason-about RLS expression.
CREATE OR REPLACE FUNCTION public.set_chat_admin(_chat_id uuid, _target_user_id uuid, _is_admin boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_chat_admin(auth.uid(), _chat_id) THEN
    RAISE EXCEPTION 'Only group admins can change admin status';
  END IF;

  UPDATE public.chat_participants
  SET is_admin = _is_admin
  WHERE chat_id = _chat_id AND user_id = _target_user_id;
END;
$$;
