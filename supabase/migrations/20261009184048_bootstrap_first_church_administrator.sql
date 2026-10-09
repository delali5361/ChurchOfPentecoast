/*
# Bootstrap the first church administrator

1. Behavior
- The first account created in Supabase Auth receives the built-in administrator role.
- Later accounts do not receive elevated access automatically.

2. Security
- The trigger runs with a fixed public search path.
- Role assignment is based on whether any church role assignment exists, not on client input.
- No existing data is removed or changed.
*/

CREATE OR REPLACE FUNCTION public.bootstrap_first_church_administrator()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  administrator_role uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM user_roles) THEN
    SELECT id INTO administrator_role FROM app_roles WHERE code = 'administrator' LIMIT 1;
    IF administrator_role IS NOT NULL THEN
      INSERT INTO user_roles (user_id, role_id) VALUES (NEW.id, administrator_role) ON CONFLICT DO NOTHING;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bootstrap_first_church_administrator_trigger ON auth.users;
CREATE TRIGGER bootstrap_first_church_administrator_trigger
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.bootstrap_first_church_administrator();

REVOKE EXECUTE ON FUNCTION public.bootstrap_first_church_administrator() FROM anon, authenticated;
