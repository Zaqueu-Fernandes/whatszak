-- Security fix: "profiles_update_own" (20260217143829_..._sql) is
-- `USING (auth.uid() = id)` with no column restriction, so it covers every
-- column on profiles — including limit_profile_id. Since Postgres RLS
-- policies for the same command are OR'd together, this let any
-- authenticated user bypass "profiles_update_admin" and self-assign any
-- limit_profiles row (e.g. "Ilimitado"), escaping admin-controlled file
-- size/retention caps and the "Privacidade" auto-delete-on-view behavior.
--
-- RLS alone can't restrict a single UPDATE policy to specific columns, so
-- this uses a BEFORE UPDATE trigger to reject any change to
-- limit_profile_id unless the caller is an admin. Regular profile edits
-- (name, avatar_url, public_key, status via the admin flow) are untouched.
CREATE OR REPLACE FUNCTION public.prevent_self_limit_profile_change()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.limit_profile_id IS DISTINCT FROM OLD.limit_profile_id
     AND NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Only admins can change limit_profile_id';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_profiles_prevent_self_limit_profile_change ON public.profiles;
CREATE TRIGGER on_profiles_prevent_self_limit_profile_change
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_self_limit_profile_change();
