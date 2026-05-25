import asyncio
import logging
import os
import sys
import asyncpg

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:password@localhost:5432/onboarding_db")

# Convert asyncpg connection string if it has +asyncpg
if "postgresql+asyncpg://" in DATABASE_URL:
    DATABASE_URL = DATABASE_URL.replace("postgresql+asyncpg://", "postgresql://")

INIT_SQL = """
-- Drop old tables if they exist
DROP TABLE IF EXISTS audit_logs CASCADE;
DROP TABLE IF EXISTS email_logs CASCADE;
DROP TABLE IF EXISTS company_accounts CASCADE;
DROP TABLE IF EXISTS inventory_assignments CASCADE;
DROP TABLE IF EXISTS inventory_assets CASCADE;
DROP TABLE IF EXISTS workflow_events CASCADE;
DROP TABLE IF EXISTS extracted_document_data CASCADE;
DROP TABLE IF EXISTS verification_records CASCADE;
DROP TABLE IF EXISTS onboarding_sessions CASCADE;
DROP TABLE IF EXISTS candidates CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS training_progress CASCADE;
DROP TABLE IF EXISTS training_modules CASCADE;

-- Users table
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    auth_user_id UUID,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    hashed_password TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('candidate', 'hr', 'it', 'manager', 'admin')),
    is_active BOOLEAN NOT NULL DEFAULT true,
    reset_required BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Candidates table
CREATE TABLE candidates (
    id SERIAL PRIMARY KEY,
    user_id INTEGER UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'applied',
    department TEXT NOT NULL DEFAULT '',
    job_title TEXT NOT NULL DEFAULT '',
    start_date DATE,
    employee_id TEXT,
    work_email TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Onboarding sessions table
CREATE TABLE onboarding_sessions (
    id SERIAL PRIMARY KEY,
    candidate_id INTEGER NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
    current_step TEXT NOT NULL,
    step_history JSONB NOT NULL DEFAULT '[]',
    variables JSONB NOT NULL DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'in_progress',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Verification records
CREATE TABLE verification_records (
    id SERIAL PRIMARY KEY,
    candidate_id INTEGER NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
    document_type TEXT NOT NULL,
    ocr_text TEXT,
    ocr_confidence FLOAT,
    verification_output JSONB NOT NULL DEFAULT '{}',
    status TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Extracted document data (PAN, Aadhaar, Bank Cancellation etc.)
CREATE TABLE extracted_document_data (
    id SERIAL PRIMARY KEY,
    candidate_id INTEGER UNIQUE NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
    pan_number TEXT,
    aadhaar_number TEXT,
    bank_account_number TEXT,
    ifsc_code TEXT,
    full_name TEXT,
    dob TEXT,
    verification_status TEXT,
    confidence_score FLOAT DEFAULT 0.0,
    signed_offer_letter BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Workflow events table
CREATE TABLE workflow_events (
    id SERIAL PRIMARY KEY,
    session_id INTEGER REFERENCES onboarding_sessions(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}',
    processed_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Inventory assets table
CREATE TABLE inventory_assets (
    id SERIAL PRIMARY KEY,
    asset_tag TEXT UNIQUE NOT NULL,
    asset_type TEXT NOT NULL,
    model TEXT NOT NULL,
    serial_number TEXT,
    status TEXT NOT NULL DEFAULT 'available',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Inventory assignments table
CREATE TABLE inventory_assignments (
    id SERIAL PRIMARY KEY,
    candidate_id INTEGER NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
    asset_id INTEGER NOT NULL REFERENCES inventory_assets(id) ON DELETE CASCADE,
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    returned_at TIMESTAMPTZ
);

-- Company accounts table
CREATE TABLE company_accounts (
    id SERIAL PRIMARY KEY,
    candidate_id INTEGER UNIQUE NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
    work_email TEXT UNIQUE NOT NULL,
    temp_password TEXT NOT NULL,
    provisioned_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Email logs
CREATE TABLE email_logs (
    id SERIAL PRIMARY KEY,
    recipient TEXT NOT NULL,
    subject TEXT NOT NULL,
    status TEXT NOT NULL,
    sent_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Audit logs
CREATE TABLE audit_logs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id INTEGER NOT NULL DEFAULT 0,
    ip_address TEXT,
    details JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Training modules table (retained for backward compatibility)
CREATE TABLE training_modules (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    department TEXT,
    duration_hours FLOAT NOT NULL DEFAULT 1.0,
    order_index INTEGER NOT NULL DEFAULT 0,
    is_mandatory BOOLEAN NOT NULL DEFAULT true
);

-- Training progress table (retained for backward compatibility)
CREATE TABLE training_progress (
    id SERIAL PRIMARY KEY,
    candidate_id INTEGER NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
    module_id INTEGER NOT NULL REFERENCES training_modules(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'not_started',
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    UNIQUE(candidate_id, module_id)
);

-- Create indexes
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_candidates_status ON candidates(status);
CREATE INDEX idx_extracted_document_data_candidate ON extracted_document_data(candidate_id);
CREATE INDEX idx_onboarding_sessions_candidate ON onboarding_sessions(candidate_id);
CREATE INDEX idx_audit_logs_user ON audit_logs(user_id);
"""

async def run():
    logger.info(f"Connecting to database at {DATABASE_URL}")
    retries = 10
    conn = None
    while retries > 0:
        try:
            conn = await asyncpg.connect(DATABASE_URL)
            break
        except Exception as e:
            logger.warning(f"Database connection failed: {e}. Retrying in 2 seconds...")
            await asyncio.sleep(2)
            retries -= 1

    if not conn:
        logger.error("Could not connect to the database. Exiting.")
        sys.exit(1)

    logger.info("Initializing schema...")
    await conn.execute(INIT_SQL)
    logger.info("Database schema initialized successfully!")
    await conn.close()

if __name__ == "__main__":
    asyncio.run(run())
