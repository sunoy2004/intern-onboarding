
/*
  # Intern Onboarding System Schema

  ## Overview
  Full-stack intern onboarding system with agentic workflows.

  ## Tables

  ### profiles
  - Extended user profile for all users (admins and interns)
  - Stores role, onboarding status, and personal information
  - Links to auth.users via id

  ### interns
  - Intern-specific data with onboarding pipeline state
  - Tracks each step: invited -> first_login -> docs_uploaded -> verified -> onboarded
  - Stores inventory allotment info and onboarding doc delivery status

  ### documents
  - Documents uploaded by interns for verification
  - Stores OCR extraction results and verification status
  - Supports multiple document types: id, address_proof, education, agreement

  ### onboarding_steps
  - Tracks each step in the onboarding pipeline per intern
  - Steps: account_setup, document_upload, ocr_verification, docs_sent, inventory_allotted, completed

  ### inventory_items
  - Catalog of inventory items available for allotment
  - Tracks stock levels

  ### inventory_allotments
  - Records inventory items allotted to each intern

  ## Security
  - RLS enabled on all tables
  - Admins can view/manage all records
  - Interns can only view/update their own records
*/

-- Create enum types
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
CREATE TYPE document_type AS ENUM ('id_proof', 'address_proof', 'education_certificate', 'offer_acceptance');
CREATE TYPE document_status AS ENUM ('pending', 'processing', 'verified', 'rejected');
CREATE TYPE step_status AS ENUM ('pending', 'in_progress', 'completed', 'failed');

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

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Admins can view all profiles"
  ON profiles FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Admins can update all profiles"
  ON profiles FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

CREATE POLICY "Admins can insert profiles"
  ON profiles FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

-- Allow the service role to insert profiles (for edge functions)
CREATE POLICY "Service role can manage profiles"
  ON profiles FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Interns table
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
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE interns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Interns can view own record"
  ON interns FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Admins can view all interns"
  ON interns FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

CREATE POLICY "Admins can insert interns"
  ON interns FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

CREATE POLICY "Admins can update interns"
  ON interns FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

CREATE POLICY "Interns can update own record"
  ON interns FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Service role can manage interns"
  ON interns FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

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

ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Interns can view own documents"
  ON documents FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM interns i WHERE i.id = documents.intern_id AND i.user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can view all documents"
  ON documents FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

CREATE POLICY "Interns can insert own documents"
  ON documents FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM interns i WHERE i.id = documents.intern_id AND i.user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can update all documents"
  ON documents FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

CREATE POLICY "Service role can manage documents"
  ON documents FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

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

ALTER TABLE onboarding_steps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Interns can view own steps"
  ON onboarding_steps FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM interns i WHERE i.id = onboarding_steps.intern_id AND i.user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can view all steps"
  ON onboarding_steps FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

CREATE POLICY "Service role can manage steps"
  ON onboarding_steps FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

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

ALTER TABLE inventory_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view inventory"
  ON inventory_items FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage inventory"
  ON inventory_items FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

CREATE POLICY "Admins can update inventory"
  ON inventory_items FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

CREATE POLICY "Service role can manage inventory items"
  ON inventory_items FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

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

ALTER TABLE inventory_allotments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Interns can view own allotments"
  ON inventory_allotments FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM interns i WHERE i.id = inventory_allotments.intern_id AND i.user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can view all allotments"
  ON inventory_allotments FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

CREATE POLICY "Admins can insert allotments"
  ON inventory_allotments FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

CREATE POLICY "Service role can manage allotments"
  ON inventory_allotments FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Audit log for agent actions
CREATE TABLE IF NOT EXISTS agent_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  intern_id uuid REFERENCES interns(id) ON DELETE SET NULL,
  action text NOT NULL,
  details jsonb,
  status text NOT NULL DEFAULT 'success',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE agent_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view all logs"
  ON agent_logs FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

CREATE POLICY "Service role can manage logs"
  ON agent_logs FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

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
