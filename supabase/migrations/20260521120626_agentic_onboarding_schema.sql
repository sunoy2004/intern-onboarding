/*
  # Agentic Onboarding System - Schema Update

  ## Summary
  Extends the existing onboarding system to support a fully agentic workflow:
  - HR enters minimal info (email, name, dept) → agent handles everything else
  - Resend email integration for sending onboarding docs, offer letters, login credentials
  - OCR agent extracts data from uploaded documents (Aadhaar, PAN, bank passbook, offer letter)
  - Extracted data stored for IT dashboard access
  - Company email assignment with auth user migration
  - Automatic inventory allotment after verification
  - Password change enforcement on first login

  ## New Tables
  - `extracted_doc_data`: Stores structured data extracted from documents by OCR agent
    - `id` (uuid, PK)
    - `intern_id` (uuid, FK → interns.id)
    - `document_type` (text): Type of document (aadhaar, pan, bank_passbook, offer_letter)
    - `extracted_fields` (jsonb): Key-value pairs of extracted data
    - `confidence_score` (numeric): OCR confidence 0-1
    - `verified_at` (timestamptz): When data was verified
    - `created_at` (timestamptz)

  - `email_logs`: Tracks all emails sent by the system
    - `id` (uuid, PK)
    - `intern_id` (uuid, FK → interns.id)
    - `email_type` (text): Type of email (onboarding_invite, company_credentials, offer_letter)
    - `recipient_email` (text): Email address sent to
    - `subject` (text): Email subject line
    - `status` (text): sent/failed
    - `resent_id` (text): Resend message ID for tracking
    - `sent_at` (timestamptz)

  - `company_emails`: Tracks company email assignments
    - `id` (uuid, PK)
    - `intern_id` (uuid, FK → interns.id)
    - `company_email` (text): The assigned company email
    - `personal_email` (text): Original personal email
    - `auth_user_id` (uuid): New auth user ID for company email
    - `old_auth_user_id` (uuid): Previous auth user ID (personal email)
    - `migration_status` (text): pending/completed/failed
    - `assigned_at` (timestamptz)
    - `migrated_at` (timestamptz)

  ## Modified Tables
  - `interns`: Added columns
    - `company_email` (text): Assigned company email
    - `personal_email` (text): Original personal email (preserved after migration)
    - `password_changed` (boolean, DEFAULT false): Whether intern changed initial password
    - `offer_letter_signed` (boolean, DEFAULT false): Whether offer letter was e-signed
    - `offer_letter_url` (text): URL to signed offer letter

  - `documents`: Added document types
    - Now supports: aadhaar, pan, bank_passbook, offer_letter (in addition to existing types)

  - `onboarding_steps`: Updated step names for agentic flow
    - Steps: email_sent, password_changed, document_upload, ocr_verification, company_email_assigned, inventory_allotment, onboarding_complete

  ## Security
  - RLS enabled on all new tables
  - Admin-only access for extracted_doc_data, email_logs, company_emails
  - Interns can view their own extracted data and email logs
  - Service role has full access for edge functions

  ## Important Notes
  1. The `password_changed` column tracks whether the intern has changed their initial password
  2. Company email migration removes the old auth user and creates a new one
  3. Extracted document data is available to IT admins for verification and later use
  4. All agent actions are logged in agent_logs for audit trail
  5. Email sending uses Resend API via edge functions
*/

-- Add new columns to interns table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'interns' AND column_name = 'company_email'
  ) THEN
    ALTER TABLE interns ADD COLUMN company_email text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'interns' AND column_name = 'personal_email'
  ) THEN
    ALTER TABLE interns ADD COLUMN personal_email text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'interns' AND column_name = 'password_changed'
  ) THEN
    ALTER TABLE interns ADD COLUMN password_changed boolean DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'interns' AND column_name = 'offer_letter_signed'
  ) THEN
    ALTER TABLE interns ADD COLUMN offer_letter_signed boolean DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'interns' AND column_name = 'offer_letter_url'
  ) THEN
    ALTER TABLE interns ADD COLUMN offer_letter_url text;
  END IF;
END $$;

-- Update existing interns: set personal_email from email if not set
UPDATE interns SET personal_email = email WHERE personal_email IS NULL;

-- Create extracted_doc_data table
CREATE TABLE IF NOT EXISTS extracted_doc_data (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  intern_id uuid NOT NULL REFERENCES interns(id) ON DELETE CASCADE,
  document_type text NOT NULL,
  extracted_fields jsonb DEFAULT '{}',
  confidence_score numeric DEFAULT 0,
  verified_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- Create email_logs table
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

-- Create company_emails table
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

-- Enable RLS on new tables
ALTER TABLE extracted_doc_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_emails ENABLE ROW LEVEL SECURITY;

-- RLS policies for extracted_doc_data
CREATE POLICY "Admins can view all extracted doc data"
  ON extracted_doc_data FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Interns can view own extracted doc data"
  ON extracted_doc_data FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM interns WHERE user_id = auth.uid() AND interns.id = extracted_doc_data.intern_id
    )
  );

CREATE POLICY "Service role manages extracted doc data"
  ON extracted_doc_data FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- RLS policies for email_logs
CREATE POLICY "Admins can view all email logs"
  ON email_logs FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Interns can view own email logs"
  ON email_logs FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM interns WHERE user_id = auth.uid() AND interns.id = email_logs.intern_id
    )
  );

CREATE POLICY "Service role manages email logs"
  ON email_logs FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- RLS policies for company_emails
CREATE POLICY "Admins can view all company emails"
  ON company_emails FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Interns can view own company emails"
  ON company_emails FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM interns WHERE user_id = auth.uid() AND interns.id = company_emails.intern_id
    )
  );

CREATE POLICY "Service role manages company emails"
  ON company_emails FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_extracted_doc_data_intern_id ON extracted_doc_data(intern_id);
CREATE INDEX IF NOT EXISTS idx_email_logs_intern_id ON email_logs(intern_id);
CREATE INDEX IF NOT EXISTS idx_company_emails_intern_id ON company_emails(intern_id);
CREATE INDEX IF NOT EXISTS idx_interns_company_email ON interns(company_email);
CREATE INDEX IF NOT EXISTS idx_interns_personal_email ON interns(personal_email);

-- Update onboarding steps for new agentic flow
-- Add a function to reinitialize onboarding steps for the new flow
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
