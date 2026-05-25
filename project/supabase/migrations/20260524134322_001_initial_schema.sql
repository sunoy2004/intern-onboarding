/*
  # Initial Onboarding System Schema

  1. New Tables
    - `users` — System users with role-based access (candidate, hr, it, manager, admin)
    - `candidates` — Employee candidates linked to users, tracking onboarding status
    - `documents` — Uploaded documents with OCR results and verification status
    - `onboarding_tasks` — Tasks assigned to AI agents during onboarding workflow
    - `approvals` — HITL approval records for irreversible actions
    - `training_modules` — Available training modules
    - `training_progress` — Candidate progress through training modules
    - `provisioning_logs` — IT resource provisioning records
    - `workflow_states` — LangGraph checkpoint state for resumable workflows
    - `audit_logs` — System-wide audit trail for all actions

  2. Enums
    - user_role, candidate_status, doc_type, doc_status, task_status,
      approval_status, training_status, resource_type

  3. Security
    - RLS enabled on all tables
    - Service role policies for backend API access
    - Auth is handled at the API layer via JWT
*/

-- Create enum types
CREATE TYPE user_role AS ENUM ('candidate', 'hr', 'it', 'manager', 'admin');
CREATE TYPE candidate_status AS ENUM ('applied', 'documents_pending', 'documents_submitted', 'documents_verified', 'it_provisioning', 'training', 'onboarded', 'rejected');
CREATE TYPE doc_type AS ENUM ('id_proof', 'address_proof', 'education_certificate', 'experience_letter', 'pan_card', 'offer_letter_signed');
CREATE TYPE doc_status AS ENUM ('uploaded', 'processing', 'verified', 'rejected', 'needs_resubmission');
CREATE TYPE task_status AS ENUM ('pending', 'in_progress', 'waiting_approval', 'completed', 'failed');
CREATE TYPE approval_status AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE training_status AS ENUM ('not_started', 'in_progress', 'completed');
CREATE TYPE resource_type AS ENUM ('employee_id', 'work_email', 'laptop', 'software_access', 'access_card');

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  hashed_password TEXT NOT NULL,
  role user_role NOT NULL DEFAULT 'candidate',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Candidates table
CREATE TABLE IF NOT EXISTS candidates (
  id SERIAL PRIMARY KEY,
  user_id INTEGER UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status candidate_status NOT NULL DEFAULT 'applied',
  department TEXT NOT NULL DEFAULT '',
  job_title TEXT NOT NULL DEFAULT '',
  start_date DATE,
  employee_id TEXT,
  work_email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Documents table
CREATE TABLE IF NOT EXISTS documents (
  id SERIAL PRIMARY KEY,
  candidate_id INTEGER NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  doc_type doc_type NOT NULL,
  file_path TEXT NOT NULL,
  original_filename TEXT NOT NULL DEFAULT '',
  ocr_confidence FLOAT,
  ocr_text TEXT,
  status doc_status NOT NULL DEFAULT 'uploaded',
  rejection_reason TEXT,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  verified_at TIMESTAMPTZ
);

-- Onboarding tasks table
CREATE TABLE IF NOT EXISTS onboarding_tasks (
  id SERIAL PRIMARY KEY,
  candidate_id INTEGER NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  agent_name TEXT NOT NULL,
  task_type TEXT NOT NULL,
  status task_status NOT NULL DEFAULT 'pending',
  payload JSONB NOT NULL DEFAULT '{}',
  result JSONB,
  checkpoint_key TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Approvals table
CREATE TABLE IF NOT EXISTS approvals (
  id SERIAL PRIMARY KEY,
  task_id INTEGER NOT NULL REFERENCES onboarding_tasks(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  status approval_status NOT NULL DEFAULT 'pending',
  approver_role TEXT NOT NULL,
  approver_id INTEGER REFERENCES users(id),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

-- Training modules table
CREATE TABLE IF NOT EXISTS training_modules (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  department TEXT,
  duration_hours FLOAT NOT NULL DEFAULT 1.0,
  order_index INTEGER NOT NULL DEFAULT 0,
  is_mandatory BOOLEAN NOT NULL DEFAULT true
);

-- Training progress table
CREATE TABLE IF NOT EXISTS training_progress (
  id SERIAL PRIMARY KEY,
  candidate_id INTEGER NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  module_id INTEGER NOT NULL REFERENCES training_modules(id) ON DELETE CASCADE,
  status training_status NOT NULL DEFAULT 'not_started',
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  UNIQUE(candidate_id, module_id)
);

-- Provisioning logs table
CREATE TABLE IF NOT EXISTS provisioning_logs (
  id SERIAL PRIMARY KEY,
  candidate_id INTEGER NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  resource_type resource_type NOT NULL,
  resource_value TEXT NOT NULL DEFAULT '',
  provisioned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  provisioned_by_agent TEXT NOT NULL DEFAULT 'it_agent'
);

-- Workflow states table
CREATE TABLE IF NOT EXISTS workflow_states (
  id SERIAL PRIMARY KEY,
  candidate_id INTEGER NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  checkpoint_key TEXT UNIQUE NOT NULL,
  graph_state_json TEXT NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Audit logs table
CREATE TABLE IF NOT EXISTS audit_logs (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id INTEGER NOT NULL DEFAULT 0,
  details JSONB,
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE onboarding_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE provisioning_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_candidates_user_id ON candidates(user_id);
CREATE INDEX IF NOT EXISTS idx_candidates_status ON candidates(status);
CREATE INDEX IF NOT EXISTS idx_documents_candidate_id ON documents(candidate_id);
CREATE INDEX IF NOT EXISTS idx_onboarding_tasks_candidate_id ON onboarding_tasks(candidate_id);
CREATE INDEX IF NOT EXISTS idx_approvals_task_id ON approvals(task_id);
CREATE INDEX IF NOT EXISTS idx_approvals_status ON approvals(status);
CREATE INDEX IF NOT EXISTS idx_approvals_approver_role ON approvals(approver_role);
CREATE INDEX IF NOT EXISTS idx_training_progress_candidate_id ON training_progress(candidate_id);
CREATE INDEX IF NOT EXISTS idx_provisioning_logs_candidate_id ON provisioning_logs(candidate_id);
CREATE INDEX IF NOT EXISTS idx_workflow_states_candidate_id ON workflow_states(candidate_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_type, entity_id);

-- Service role policies for backend API access
-- Auth is enforced at the API layer via JWT + RBAC middleware
CREATE POLICY "Service role access on users" ON users FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role access on candidates" ON candidates FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role access on documents" ON documents FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role access on tasks" ON onboarding_tasks FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role access on approvals" ON approvals FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role access on training_modules" ON training_modules FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role access on training_progress" ON training_progress FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role access on provisioning_logs" ON provisioning_logs FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role access on workflow_states" ON workflow_states FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role access on audit_logs" ON audit_logs FOR ALL TO service_role USING (true) WITH CHECK (true);
