
/*
  # Fix RLS Infinite Recursion

  The "Admins can view all profiles" policy queries the profiles table to check
  if the current user is an admin, which triggers the same policy recursively.

  Fix: Use auth.jwt() to read the role from the JWT metadata instead of querying
  profiles, which avoids any recursive table access.

  The admin user has role stored in raw_user_meta_data via the handle_new_user trigger.
  We use auth.jwt() -> 'user_metadata' -> 'role' to check admin status.
*/

-- Drop the recursive admin policies on profiles
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can update all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can insert profiles" ON public.profiles;

-- Drop the recursive admin policies on interns
DROP POLICY IF EXISTS "Admins can view all interns" ON public.interns;
DROP POLICY IF EXISTS "Admins can update interns" ON public.interns;
DROP POLICY IF EXISTS "Admins can insert interns" ON public.interns;

-- Drop recursive admin policies on other tables too
DROP POLICY IF EXISTS "Admins can view all documents" ON public.documents;
DROP POLICY IF EXISTS "Admins can update documents" ON public.documents;
DROP POLICY IF EXISTS "Admins can view all steps" ON public.onboarding_steps;
DROP POLICY IF EXISTS "Admins can update steps" ON public.onboarding_steps;
DROP POLICY IF EXISTS "Admins can view all allotments" ON public.inventory_allotments;
DROP POLICY IF EXISTS "Admins can insert allotments" ON public.inventory_allotments;
DROP POLICY IF EXISTS "Admins can view all logs" ON public.agent_logs;
DROP POLICY IF EXISTS "Admins can insert logs" ON public.agent_logs;
DROP POLICY IF EXISTS "Admins can view inventory" ON public.inventory_items;

-- Helper function to check admin role from JWT (avoids recursive profile queries)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
     OR  (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin';
$$;

-- Recreate profiles policies using is_admin()
CREATE POLICY "Admins can view all profiles"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (public.is_admin());

CREATE POLICY "Admins can update all profiles"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "Admins can insert profiles"
  ON public.profiles FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

-- Recreate interns policies using is_admin()
CREATE POLICY "Admins can view all interns"
  ON public.interns FOR SELECT
  TO authenticated
  USING (public.is_admin());

CREATE POLICY "Admins can update interns"
  ON public.interns FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "Admins can insert interns"
  ON public.interns FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

-- Recreate documents policies using is_admin()
CREATE POLICY "Admins can view all documents"
  ON public.documents FOR SELECT
  TO authenticated
  USING (public.is_admin());

CREATE POLICY "Admins can update documents"
  ON public.documents FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Recreate onboarding_steps policies using is_admin()
CREATE POLICY "Admins can view all steps"
  ON public.onboarding_steps FOR SELECT
  TO authenticated
  USING (public.is_admin());

CREATE POLICY "Admins can update steps"
  ON public.onboarding_steps FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Recreate inventory_allotments policies using is_admin()
CREATE POLICY "Admins can view all allotments"
  ON public.inventory_allotments FOR SELECT
  TO authenticated
  USING (public.is_admin());

CREATE POLICY "Admins can insert allotments"
  ON public.inventory_allotments FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

-- Recreate agent_logs policies using is_admin()
CREATE POLICY "Admins can view all logs"
  ON public.agent_logs FOR SELECT
  TO authenticated
  USING (public.is_admin());

CREATE POLICY "Admins can insert logs"
  ON public.agent_logs FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

-- Recreate inventory_items policy using is_admin()
CREATE POLICY "Admins can view inventory"
  ON public.inventory_items FOR SELECT
  TO authenticated
  USING (public.is_admin());
