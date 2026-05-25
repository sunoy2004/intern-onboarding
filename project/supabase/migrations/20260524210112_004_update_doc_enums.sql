/*
  # Update document enums and columns for required onboarding documents

  1. Changes
    - Add new values to doc_type enum: aadhaar_card, 10th_certificate, 12th_certificate
    - Add 'pending' to doc_status enum (for pre-created document records before upload)
    - Make original_filename nullable (pending docs have no file yet)
    - Make file_path nullable (pending docs have no path yet)
    - Make uploaded_at nullable (pending docs have no upload time yet)

  2. Notes
    - pan_card already exists in the doc_type enum
    - The onboarding-invite edge function creates 4 pending document records
      (aadhaar_card, pan_card, 10th_certificate, 12th_certificate) when a
      new hire is invited
    - Candidates upload files to update these pending records
*/
ALTER TYPE doc_type ADD VALUE IF NOT EXISTS 'aadhaar_card';
ALTER TYPE doc_type ADD VALUE IF NOT EXISTS '10th_certificate';
ALTER TYPE doc_type ADD VALUE IF NOT EXISTS '12th_certificate';
ALTER TYPE doc_status ADD VALUE IF NOT EXISTS 'pending';

ALTER TABLE documents ALTER COLUMN original_filename DROP NOT NULL;
ALTER TABLE documents ALTER COLUMN file_path DROP NOT NULL;
ALTER TABLE documents ALTER COLUMN uploaded_at DROP NOT NULL;
