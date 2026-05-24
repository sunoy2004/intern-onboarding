-- ==========================================
-- Final Consolidated Database Schema Query
-- ==========================================

-- 1. Enable extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 2. Create custom enum types
CREATE TYPE user_role AS ENUM ('admin', 'intern');
CREATE TYPE onboarding_status AS ENUM (
  'invited',
  'first_login',
  'docs_uploaded',
  'ocr_processing',
  'verified',
  'docs_sent',
  'inventory_allotted',
  'completed'
);
CREATE TYPE document_type AS ENUM (
  'id_proof', 
  'address_proof', 
  'education_certificate', 
  'offer_acceptance', 
  'aadhaar', 
  'pan', 
  'bank_passbook', 
  'offer_letter'
);
CREATE TYPE document_status AS ENUM ('pending', 'processing', 'verified', 'rejected');
CREATE TYPE step_status AS ENUM ('pending', 'in_progress', 'completed', 'failed');

-- 3. Create core tables

-- Profiles table (extends auth.users)
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text UNIQUE NOT NULL,
  full_name text,
  role user_role NOT NULL DEFAULT 'intern',
  avatar_url text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Interns table (with fields from migration 1 & 8)
CREATE TABLE IF NOT EXISTS interns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  email text UNIQUE NOT NULL,
  full_name text NOT NULL,
  department text,
  start_date date,
  end_date date,
  manager_name text,
  onboarding_status onboarding_status NOT NULL DEFAULT 'invited',
  is_first_login boolean NOT NULL DEFAULT true,
  temp_password text,
  invited_at timestamptz DEFAULT now(),
  first_login_at timestamptz,
  verified_at timestamptz,
  completed_at timestamptz,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  company_email text,
  personal_email text,
  password_changed boolean DEFAULT false,
  offer_letter_signed boolean DEFAULT false,
  offer_letter_url text
);

-- Documents table
CREATE TABLE IF NOT EXISTS documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  intern_id uuid NOT NULL REFERENCES interns(id) ON DELETE CASCADE,
  document_type document_type NOT NULL,
  file_name text NOT NULL,
  file_url text NOT NULL,
  file_size integer,
  mime_type text,
  status document_status NOT NULL DEFAULT 'pending',
  ocr_raw_text text,
  ocr_extracted_data jsonb,
  rejection_reason text,
  uploaded_at timestamptz DEFAULT now(),
  processed_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- Onboarding steps table
CREATE TABLE IF NOT EXISTS onboarding_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  intern_id uuid NOT NULL REFERENCES interns(id) ON DELETE CASCADE,
  step_name text NOT NULL,
  step_order integer NOT NULL,
  status step_status NOT NULL DEFAULT 'pending',
  completed_at timestamptz,
  metadata jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(intern_id, step_name)
);

-- Inventory items catalog
CREATE TABLE IF NOT EXISTS inventory_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  category text NOT NULL,
  stock_count integer NOT NULL DEFAULT 0,
  is_mandatory boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Inventory allotments
CREATE TABLE IF NOT EXISTS inventory_allotments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  intern_id uuid NOT NULL REFERENCES interns(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES inventory_items(id),
  quantity integer NOT NULL DEFAULT 1,
  allotted_at timestamptz DEFAULT now(),
  returned_at timestamptz,
  notes text,
  created_at timestamptz DEFAULT now()
);

-- Audit log for agent actions
CREATE TABLE IF NOT EXISTS agent_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  intern_id uuid REFERENCES interns(id) ON DELETE SET NULL,
  action text NOT NULL,
  details jsonb,
  status text NOT NULL DEFAULT 'success',
  created_at timestamptz DEFAULT now()
);

-- Extracted doc data table (from migration 8)
CREATE TABLE IF NOT EXISTS extracted_doc_data (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  intern_id uuid NOT NULL REFERENCES interns(id) ON DELETE CASCADE,
  document_type text NOT NULL,
  extracted_fields jsonb DEFAULT '{}',
  confidence_score numeric DEFAULT 0,
  verified_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- Email logs table (from migration 8)
CREATE TABLE IF NOT EXISTS email_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  intern_id uuid NOT NULL REFERENCES interns(id) ON DELETE CASCADE,
  email_type text NOT NULL,
  recipient_email text NOT NULL,
  subject text NOT NULL,
  status text DEFAULT 'pending',
  resent_id text,
  sent_at timestamptz DEFAULT now()
);

-- Company emails table (from migration 8)
CREATE TABLE IF NOT EXISTS company_emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  intern_id uuid NOT NULL REFERENCES interns(id) ON DELETE CASCADE,
  company_email text NOT NULL,
  personal_email text NOT NULL,
  auth_user_id uuid,
  old_auth_user_id uuid,
  migration_status text DEFAULT 'pending',
  assigned_at timestamptz DEFAULT now(),
  migrated_at timestamptz
);


-- 4. Enable Row Level Security (RLS) on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE interns ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE onboarding_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_allotments ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE extracted_doc_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_emails ENABLE ROW LEVEL SECURITY;


-- 5. Helper Functions and Triggers

-- Function to auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER interns_updated_at BEFORE UPDATE ON interns FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER onboarding_steps_updated_at BEFORE UPDATE ON onboarding_steps FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Function to create profile on user creation
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE((NEW.raw_user_meta_data->>'role')::user_role, 'intern')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

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

-- Create intern user via SQL function
CREATE OR REPLACE FUNCTION public.create_intern_user(
  p_email text,
  p_password text,
  p_full_name text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  v_user_id := gen_random_uuid();

  INSERT INTO auth.users (
    id,
    instance_id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    is_super_admin,
    created_at,
    updated_at,
    confirmation_token,
    recovery_token,
    email_change_token_new,
    email_change,
    email_change_token_current,
    email_change_confirm_status,
    is_sso_user,
    phone_change,
    phone_change_token,
    reauthentication_token
  ) VALUES (
    v_user_id,
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    p_email,
    crypt(p_password, gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}',
    jsonb_build_object('full_name', p_full_name, 'role', 'intern'),
    false,
    now(),
    now(),
    '', '', '', '', '', 0, false, '', '', ''
  );

  INSERT INTO auth.identities (
    id,
    user_id,
    identity_data,
    provider,
    last_sign_in_at,
    created_at,
    updated_at,
    provider_id
  ) VALUES (
    gen_random_uuid(),
    v_user_id,
    jsonb_build_object('sub', v_user_id::text, 'email', p_email, 'email_verified', true, 'phone_verified', false),
    'email',
    now(),
    now(),
    now(),
    v_user_id::text
  );

  RETURN v_user_id;
END;
$$;

-- Grant execute to service role (used by edge functions)
GRANT EXECUTE ON FUNCTION public.create_intern_user(text, text, text) TO service_role;

-- Function to reinitialize onboarding steps for the new flow
CREATE OR REPLACE FUNCTION reinitialize_onboarding_steps(p_intern_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM onboarding_steps WHERE intern_id = p_intern_id;
  
  INSERT INTO onboarding_steps (intern_id, step_name, step_order, status) VALUES
    (p_intern_id, 'email_sent', 1, 'pending'),
    (p_intern_id, 'password_changed', 2, 'pending'),
    (p_intern_id, 'document_upload', 3, 'pending'),
    (p_intern_id, 'ocr_verification', 4, 'pending'),
    (p_intern_id, 'company_email_assigned', 5, 'pending'),
    (p_intern_id, 'inventory_allotment', 6, 'pending'),
    (p_intern_id, 'onboarding_complete', 7, 'pending');
END;
$$;

-- Function to create company email auth user and migrate data
CREATE OR REPLACE FUNCTION migrate_to_company_email(
  p_intern_id uuid,
  p_company_email text,
  p_password text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_old_user_id uuid;
  v_new_user_id uuid;
  v_intern_record RECORD;
  v_full_name text;
BEGIN
  -- Get intern details
  SELECT * INTO v_intern_record FROM interns WHERE id = p_intern_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Intern not found';
  END IF;

  v_old_user_id := v_intern_record.user_id;
  v_full_name := v_intern_record.full_name;

  -- Create new auth user with company email
  INSERT INTO auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at,
    confirmation_token,
    email_change,
    email_change_token_new,
    recovery_token
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    gen_random_uuid(),
    'authenticated',
    'authenticated',
    p_company_email,
    crypt(p_password, gen_salt('bf')),
    now(),
    '{"provider": "email", "providers": ["email"], "role": "intern"}',
    jsonb_build_object('full_name', v_full_name, 'role', 'intern'),
    now(),
    now(),
    '',
    '',
    '',
    ''
  ) RETURNING id INTO v_new_user_id;

  -- Create identity for new user
  INSERT INTO auth.identities (
    id,
    user_id,
    provider_id,
    provider,
    identity_data,
    last_sign_in_at,
    created_at,
    updated_at
  ) VALUES (
    gen_random_uuid(),
    v_new_user_id,
    p_company_email,
    'email',
    jsonb_build_object(
      'sub', v_new_user_id::text,
      'email', p_company_email,
      'email_verified', true
    ),
    now(),
    now(),
    now()
  );

  -- Update profile to point to new user
  UPDATE profiles SET id = v_new_user_id, email = p_company_email WHERE id = v_old_user_id;

  -- Update intern record
  UPDATE interns SET
    user_id = v_new_user_id,
    email = p_company_email,
    company_email = p_company_email,
    personal_email = v_intern_record.email,
    temp_password = p_password,
    password_changed = false
  WHERE id = p_intern_id;

  -- Update document ownership (storage paths reference user_id)
  UPDATE documents SET intern_id = p_intern_id WHERE intern_id = p_intern_id;

  -- Update inventory allotments
  UPDATE inventory_allotments SET intern_id = p_intern_id WHERE intern_id = p_intern_id;

  -- Update onboarding steps
  UPDATE onboarding_steps SET intern_id = p_intern_id WHERE intern_id = p_intern_id;

  -- Record in company_emails table
  INSERT INTO company_emails (intern_id, company_email, personal_email, auth_user_id, old_auth_user_id, migration_status, migrated_at)
  VALUES (p_intern_id, p_company_email, v_intern_record.email, v_new_user_id, v_old_user_id, 'completed', now());

  -- Delete old auth user (this cascades to identities)
  DELETE FROM auth.users WHERE id = v_old_user_id;

  RETURN v_new_user_id;
END;
$$;


-- 6. Create performance indexes
CREATE INDEX IF NOT EXISTS idx_extracted_doc_data_intern_id ON extracted_doc_data(intern_id);
CREATE INDEX IF NOT EXISTS idx_email_logs_intern_id ON email_logs(intern_id);
CREATE INDEX IF NOT EXISTS idx_company_emails_intern_id ON company_emails(intern_id);
CREATE INDEX IF NOT EXISTS idx_interns_company_email ON interns(company_email);
CREATE INDEX IF NOT EXISTS idx_interns_personal_email ON interns(personal_email);


-- 7. Security Policies (using public.is_admin() for admins to avoid recursion)

-- Profiles
CREATE POLICY "Users can view own profile" ON profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY "Service role can manage profiles" ON profiles FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Admins can view all profiles" ON profiles FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY "Admins can update all profiles" ON profiles FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "Admins can insert profiles" ON profiles FOR INSERT TO authenticated WITH CHECK (public.is_admin());

-- Interns
CREATE POLICY "Interns can view own record" ON interns FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Interns can update own record" ON interns FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Service role can manage interns" ON interns FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Admins can view all interns" ON interns FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY "Admins can update interns" ON interns FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "Admins can insert interns" ON interns FOR INSERT TO authenticated WITH CHECK (public.is_admin());

-- Documents
CREATE POLICY "Interns can view own documents" ON documents FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM interns i WHERE i.id = documents.intern_id AND i.user_id = auth.uid()));
CREATE POLICY "Interns can insert own documents" ON documents FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM interns i WHERE i.id = documents.intern_id AND i.user_id = auth.uid()));
CREATE POLICY "Service role can manage documents" ON documents FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Admins can view all documents" ON documents FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY "Admins can update documents" ON documents FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Onboarding steps
CREATE POLICY "Interns can view own steps" ON onboarding_steps FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM interns i WHERE i.id = onboarding_steps.intern_id AND i.user_id = auth.uid()));
CREATE POLICY "Service role can manage steps" ON onboarding_steps FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Admins can view all steps" ON onboarding_steps FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY "Admins can update steps" ON onboarding_steps FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Inventory items
CREATE POLICY "Authenticated users can view inventory" ON inventory_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Service role can manage inventory items" ON inventory_items FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Admins can view inventory" ON inventory_items FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY "Admins can manage inventory" ON inventory_items FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY "Admins can update inventory" ON inventory_items FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Inventory allotments
CREATE POLICY "Interns can view own allotments" ON inventory_allotments FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM interns i WHERE i.id = inventory_allotments.intern_id AND i.user_id = auth.uid()));
CREATE POLICY "Service role can manage allotments" ON inventory_allotments FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Admins can view all allotments" ON inventory_allotments FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY "Admins can insert allotments" ON inventory_allotments FOR INSERT TO authenticated WITH CHECK (public.is_admin());

-- Agent logs
CREATE POLICY "Service role can manage logs" ON agent_logs FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Admins can view all logs" ON agent_logs FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY "Admins can insert logs" ON agent_logs FOR INSERT TO authenticated WITH CHECK (public.is_admin());

-- Extracted doc data
CREATE POLICY "Service role manages extracted doc data" ON extracted_doc_data FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Admins can view all extracted doc data" ON extracted_doc_data FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY "Interns can view own extracted doc data" ON extracted_doc_data FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM interns i WHERE i.user_id = auth.uid() AND i.id = extracted_doc_data.intern_id));

-- Email logs
CREATE POLICY "Service role manages email logs" ON email_logs FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Admins can view all email logs" ON email_logs FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY "Interns can view own email logs" ON email_logs FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM interns i WHERE i.user_id = auth.uid() AND i.id = email_logs.intern_id));

-- Company emails
CREATE POLICY "Service role manages company emails" ON company_emails FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Admins can view all company emails" ON company_emails FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY "Interns can view own company emails" ON company_emails FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM interns i WHERE i.user_id = auth.uid() AND i.id = company_emails.intern_id));

-- Storage Objects (Bucket: documents)
CREATE POLICY "Interns can upload own documents"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'documents' AND
    (storage.foldername(name))[1] IN (
      SELECT i.id::text FROM interns i WHERE i.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can view own documents"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'documents' AND (
      (storage.foldername(name))[1] IN (
        SELECT i.id::text FROM interns i WHERE i.user_id = auth.uid()
      )
      OR public.is_admin()
    )
  );

CREATE POLICY "Users can update own documents"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'documents' AND
    (storage.foldername(name))[1] IN (
      SELECT i.id::text FROM interns i WHERE i.user_id = auth.uid()
    )
  )
  WITH CHECK (
    bucket_id = 'documents' AND
    (storage.foldername(name))[1] IN (
      SELECT i.id::text FROM interns i WHERE i.user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can upload documents"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'documents' AND
    public.is_admin()
  );

CREATE POLICY "Admins can update documents"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'documents' AND
    public.is_admin()
  )
  WITH CHECK (
    bucket_id = 'documents' AND
    public.is_admin()
  );

CREATE POLICY "Admins can delete documents"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'documents' AND
    public.is_admin()
  );


-- 8. Seed initial database records

-- Seed default inventory items
INSERT INTO inventory_items (name, description, category, stock_count, is_mandatory) VALUES
  ('Laptop', 'MacBook Pro / ThinkPad for development work', 'Electronics', 10, true),
  ('Access Card', 'Building access card', 'Security', 50, true),
  ('Office Chair', 'Ergonomic office chair', 'Furniture', 5, false),
  ('Notebook & Pen Set', 'Stationery starter pack', 'Stationery', 100, true),
  ('Company T-Shirt', 'Welcome gift — company branded shirt', 'Merchandise', 30, false),
  ('Headphones', 'Noise-cancelling headphones', 'Electronics', 8, false),
  ('Mouse & Keyboard', 'Wireless mouse and keyboard combo', 'Electronics', 15, true),
  ('ID Card Holder', 'Lanyard and ID card holder', 'Security', 200, true)
ON CONFLICT DO NOTHING;

-- Seed admin user
DO $$
DECLARE
  admin_id uuid := gen_random_uuid();
BEGIN
  -- Only insert if not already present
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'admin@internhub.com') THEN

    INSERT INTO auth.users (
      id,
      instance_id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      invited_at,
      confirmation_token,
      confirmation_sent_at,
      recovery_token,
      recovery_sent_at,
      email_change_token_new,
      email_change,
      email_change_sent_at,
      last_sign_in_at,
      raw_app_meta_data,
      raw_user_meta_data,
      is_super_admin,
      created_at,
      updated_at,
      phone,
      phone_confirmed_at,
      phone_change,
      phone_change_token,
      phone_change_sent_at,
      email_change_token_current,
      email_change_confirm_status,
      banned_until,
      reauthentication_token,
      reauthentication_sent_at,
      is_sso_user,
      deleted_at
    ) VALUES (
      admin_id,
      '00000000-0000-0000-0000-000000000000',
      'authenticated',
      'authenticated',
      'admin@internhub.com',
      crypt('Admin@2026!', gen_salt('bf')),
      now(),
      NULL,
      '',
      NULL,
      '',
      NULL,
      '',
      '',
      NULL,
      now(),
      '{"provider":"email","providers":["email"]}',
      '{"full_name":"Admin User","role":"admin"}',
      false,
      now(),
      now(),
      NULL,
      NULL,
      '',
      '',
      NULL,
      '',
      0,
      NULL,
      '',
      NULL,
      false,
      NULL
    );

    INSERT INTO auth.identities (
      id,
      user_id,
      identity_data,
      provider,
      last_sign_in_at,
      created_at,
      updated_at,
      provider_id
    ) VALUES (
      gen_random_uuid(),
      admin_id,
      jsonb_build_object('sub', admin_id::text, 'email', 'admin@internhub.com', 'email_verified', true, 'phone_verified', false),
      'email',
      now(),
      now(),
      now(),
      admin_id::text
    );

    INSERT INTO public.profiles (id, email, full_name, role)
    VALUES (admin_id, 'admin@internhub.com', 'Admin User', 'admin')
    ON CONFLICT (id) DO UPDATE SET role = 'admin', full_name = 'Admin User';

  END IF;
END $$;


-- Allow authenticated admins to upload/update/delete documents in any folder of the documents bucket
CREATE POLICY "Admins can upload documents"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'documents' AND
    EXISTS (
      SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

CREATE POLICY "Admins can update documents"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'documents' AND
    EXISTS (
      SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  )
  WITH CHECK (
    bucket_id = 'documents' AND
    EXISTS (
      SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

CREATE POLICY "Admins can delete documents"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'documents' AND
    EXISTS (
      SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );
