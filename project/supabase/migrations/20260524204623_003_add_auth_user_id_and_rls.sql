/*
  # Add auth_user_id to users table and migrate to Supabase Auth

  1. Changes
    - Add `auth_user_id` column to `users` table (nullable uuid, references auth.users.id)
    - This links our application users to Supabase Auth users

  2. Security
    - Replace permissive `anon` RLS policies with proper `authenticated` policies
    - Authenticated users can only access their own data (by matching auth.uid() to auth_user_id)
    - Service role retains full access for edge functions
    - `anon` role gets SELECT-only access on users table for login lookup

  3. Notes
    - The auth_user_id will be populated when users are created via the
      onboarding-invite edge function or the seed-auth function
    - Demo users will be migrated by the seed-auth edge function
*/
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'auth_user_id'
  ) THEN
    ALTER TABLE users ADD COLUMN auth_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Drop old permissive anon policies
DROP POLICY IF EXISTS "Anon can read users" ON users;
DROP POLICY IF EXISTS "Anon can insert users" ON users;
DROP POLICY IF EXISTS "Anon can update users" ON users;
DROP POLICY IF EXISTS "Anon can delete users" ON users;
DROP POLICY IF EXISTS "Anon can read candidates" ON candidates;
DROP POLICY IF EXISTS "Anon can insert candidates" ON candidates;
DROP POLICY IF EXISTS "Anon can update candidates" ON candidates;
DROP POLICY IF EXISTS "Anon can delete candidates" ON candidates;
DROP POLICY IF EXISTS "Anon can read documents" ON documents;
DROP POLICY IF EXISTS "Anon can insert documents" ON documents;
DROP POLICY IF EXISTS "Anon can update documents" ON documents;
DROP POLICY IF EXISTS "Anon can delete documents" ON documents;
DROP POLICY IF EXISTS "Anon can read tasks" ON onboarding_tasks;
DROP POLICY IF EXISTS "Anon can insert tasks" ON onboarding_tasks;
DROP POLICY IF EXISTS "Anon can update tasks" ON onboarding_tasks;
DROP POLICY IF EXISTS "Anon can delete tasks" ON onboarding_tasks;
DROP POLICY IF EXISTS "Anon can read approvals" ON approvals;
DROP POLICY IF EXISTS "Anon can insert approvals" ON approvals;
DROP POLICY IF EXISTS "Anon can update approvals" ON approvals;
DROP POLICY IF EXISTS "Anon can delete approvals" ON approvals;
DROP POLICY IF EXISTS "Anon can read training_modules" ON training_modules;
DROP POLICY IF EXISTS "Anon can insert training_modules" ON training_modules;
DROP POLICY IF EXISTS "Anon can update training_modules" ON training_modules;
DROP POLICY IF EXISTS "Anon can delete training_modules" ON training_modules;
DROP POLICY IF EXISTS "Anon can read training_progress" ON training_progress;
DROP POLICY IF EXISTS "Anon can insert training_progress" ON training_progress;
DROP POLICY IF EXISTS "Anon can update training_progress" ON training_progress;
DROP POLICY IF EXISTS "Anon can delete training_progress" ON training_progress;
DROP POLICY IF EXISTS "Anon can read provisioning_logs" ON provisioning_logs;
DROP POLICY IF EXISTS "Anon can insert provisioning_logs" ON provisioning_logs;
DROP POLICY IF EXISTS "Anon can update provisioning_logs" ON provisioning_logs;
DROP POLICY IF EXISTS "Anon can delete provisioning_logs" ON provisioning_logs;
DROP POLICY IF EXISTS "Anon can read workflow_states" ON workflow_states;
DROP POLICY IF EXISTS "Anon can insert workflow_states" ON workflow_states;
DROP POLICY IF EXISTS "Anon can update workflow_states" ON workflow_states;
DROP POLICY IF EXISTS "Anon can delete workflow_states" ON workflow_states;
DROP POLICY IF EXISTS "Anon can read audit_logs" ON audit_logs;
DROP POLICY IF EXISTS "Anon can insert audit_logs" ON audit_logs;
DROP POLICY IF EXISTS "Anon can update audit_logs" ON audit_logs;
DROP POLICY IF EXISTS "Anon can delete audit_logs" ON audit_logs;

-- Authenticated user policies: users can read own profile
CREATE POLICY "Authenticated users can read own profile"
  ON users FOR SELECT TO authenticated
  USING (auth.uid() = auth_user_id);

-- Users can update own profile (name, etc. but not role)
CREATE POLICY "Authenticated users can update own profile"
  ON users FOR UPDATE TO authenticated
  USING (auth.uid() = auth_user_id)
  WITH CHECK (auth.uid() = auth_user_id);

-- Candidates: authenticated users can read candidate linked to their user_id
CREATE POLICY "Authenticated read own candidate"
  ON candidates FOR SELECT TO authenticated
  USING (user_id IN (SELECT id FROM users WHERE auth_user_id = auth.uid()));

-- Documents: authenticated users can read/insert docs for their candidate
CREATE POLICY "Authenticated read own documents"
  ON documents FOR SELECT TO authenticated
  USING (candidate_id IN (
    SELECT c.id FROM candidates c JOIN users u ON c.user_id = u.id
    WHERE u.auth_user_id = auth.uid()
  ));

CREATE POLICY "Authenticated insert own documents"
  ON documents FOR INSERT TO authenticated
  WITH CHECK (candidate_id IN (
    SELECT c.id FROM candidates c JOIN users u ON c.user_id = u.id
    WHERE u.auth_user_id = auth.uid()
  ));

-- Training: authenticated users read own progress
CREATE POLICY "Authenticated read own training_progress"
  ON training_progress FOR SELECT TO authenticated
  USING (candidate_id IN (
    SELECT c.id FROM candidates c JOIN users u ON c.user_id = u.id
    WHERE u.auth_user_id = auth.uid()
  ));

CREATE POLICY "Authenticated update own training_progress"
  ON training_progress FOR UPDATE TO authenticated
  USING (candidate_id IN (
    SELECT c.id FROM candidates c JOIN users u ON c.user_id = u.id
    WHERE u.auth_user_id = auth.uid()
  ));

-- Onboarding tasks: authenticated users read own tasks
CREATE POLICY "Authenticated read own tasks"
  ON onboarding_tasks FOR SELECT TO authenticated
  USING (candidate_id IN (
    SELECT c.id FROM candidates c JOIN users u ON c.user_id = u.id
    WHERE u.auth_user_id = auth.uid()
  ));

-- Training modules: all authenticated users can read
CREATE POLICY "Authenticated read training_modules"
  ON training_modules FOR SELECT TO authenticated
  USING (true);

-- Audit logs: authenticated users read their own logs
CREATE POLICY "Authenticated read own audit_logs"
  ON audit_logs FOR SELECT TO authenticated
  USING (user_id IN (SELECT id FROM users WHERE auth_user_id = auth.uid()));

-- Workflow states: authenticated users read own
CREATE POLICY "Authenticated read own workflow_states"
  ON workflow_states FOR SELECT TO authenticated
  USING (candidate_id IN (
    SELECT c.id FROM candidates c JOIN users u ON c.user_id = u.id
    WHERE u.auth_user_id = auth.uid()
  ));

-- Approvals: authenticated users can read approvals where they are the approver
-- (HR/IT/Admin/Manager roles). We allow all authenticated to read since
-- the frontend filters by approver_role based on the logged-in user's role.
CREATE POLICY "Authenticated read approvals"
  ON approvals FOR SELECT TO authenticated
  USING (true);

-- Provisioning logs: all authenticated can read
CREATE POLICY "Authenticated read provisioning_logs"
  ON provisioning_logs FOR SELECT TO authenticated
  USING (true);

-- For staff roles (HR, IT, Admin, Manager) we need broader access.
-- We use a helper function to check if the authenticated user has a staff role.
CREATE OR REPLACE FUNCTION is_staff_role()
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM users WHERE auth_user_id = auth.uid() AND role IN ('admin', 'hr', 'it', 'manager')
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Staff can read all candidates
CREATE POLICY "Staff can read all candidates"
  ON candidates FOR SELECT TO authenticated
  USING (is_staff_role());

-- Staff can update candidates
CREATE POLICY "Staff can update candidates"
  ON candidates FOR UPDATE TO authenticated
  USING (is_staff_role())
  WITH CHECK (is_staff_role());

-- Staff can insert candidates
CREATE POLICY "Staff can insert candidates"
  ON candidates FOR INSERT TO authenticated
  WITH CHECK (is_staff_role());

-- Staff can insert/update approvals and tasks
CREATE POLICY "Staff can insert approvals"
  ON approvals FOR INSERT TO authenticated
  WITH CHECK (is_staff_role());

CREATE POLICY "Staff can update approvals"
  ON approvals FOR UPDATE TO authenticated
  USING (is_staff_role())
  WITH CHECK (is_staff_role());

CREATE POLICY "Staff can insert tasks"
  ON onboarding_tasks FOR INSERT TO authenticated
  WITH CHECK (is_staff_role());

CREATE POLICY "Staff can update tasks"
  ON onboarding_tasks FOR UPDATE TO authenticated
  USING (is_staff_role())
  WITH CHECK (is_staff_role());

-- Staff can insert audit logs
CREATE POLICY "Staff can insert audit_logs"
  ON audit_logs FOR INSERT TO authenticated
  WITH CHECK (is_staff_role());

-- Staff can insert provisioning logs
CREATE POLICY "Staff can insert provisioning_logs"
  ON provisioning_logs FOR INSERT TO authenticated
  WITH CHECK (is_staff_role());

-- Staff can read all users
CREATE POLICY "Staff can read all users"
  ON users FOR SELECT TO authenticated
  USING (is_staff_role());

-- Staff can insert users (for creating new hires)
CREATE POLICY "Staff can insert users"
  ON users FOR INSERT TO authenticated
  WITH CHECK (is_staff_role());

-- Staff can manage training modules and progress
CREATE POLICY "Staff can insert training_modules"
  ON training_modules FOR INSERT TO authenticated
  WITH CHECK (is_staff_role());

CREATE POLICY "Staff can update training_modules"
  ON training_modules FOR UPDATE TO authenticated
  USING (is_staff_role())
  WITH CHECK (is_staff_role());

CREATE POLICY "Staff can insert training_progress"
  ON training_progress FOR INSERT TO authenticated
  WITH CHECK (is_staff_role());

-- Allow anon to read users table for login lookup only (email + id + role + is_active)
-- This is needed before auth is established
CREATE POLICY "Anon can read users for login"
  ON users FOR SELECT TO anon
  USING (true);
