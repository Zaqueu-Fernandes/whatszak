-- Group chat creation, mirroring create_private_chat's pattern: SECURITY
-- DEFINER so the creator can insert chat_participants rows for other users
-- atomically — chat_participants_insert's own RLS check
-- (auth.uid() = user_id OR is_chat_participant(auth.uid(), chat_id)) can't
-- be satisfied for a brand new chat by a plain multi-row client insert,
-- since the creator isn't "already a participant" until their own row
-- lands first.
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

  INSERT INTO chat_participants (chat_id, user_id) VALUES (_chat_id, _current_user_id);

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
