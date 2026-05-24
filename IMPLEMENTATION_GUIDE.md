# Agentic Onboarding System - Implementation Guide

## Overview

This system implements a fully agentic intern onboarding pipeline where HR only needs to enter an intern's name, email, and department. The AI agents handle everything else: sending credentials, verifying documents, assigning company emails, and allotting inventory.

## Architecture

```
HR Dashboard (3 fields) --> add-intern edge function
  |
  +--> send-email (Resend) --> Intern receives email with:
  |    - Login credentials (email + temp password)
  |    - Onboarding docs link
  |    - Offer letter for e-sign
  |    - Document upload requirements
  |
  +--> Intern logs in --> Must change password first
  |
  +--> Intern uploads docs (Aadhaar, PAN, Bank Passbook, Offer Letter)
  |
  +--> verify-documents edge function (OCR Agent)
  |    - Uses LLM (OpenAI GPT-4o-mini) for document OCR
  |    - Falls back to simulated OCR if no LLM key
  |    - Extracts structured data from each document
  |    - Stores extracted data in extracted_doc_data table
  |    - If all docs verified, triggers company email assignment
  |
  +--> assign-company-email edge function
  |    - Generates company email (firstname.lastname@domain)
  |    - Creates new auth user with company email
  |    - Migrates all intern data to new user
  |    - Deletes old auth user (personal email)
  |    - Sends credentials email to personal email
  |    - Triggers inventory allotment
  |
  +--> onboarding-agent edge function
       - Allots mandatory inventory items
       - Marks onboarding as complete
```

## Environment Variables

### Frontend (.env)

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

### Supabase Edge Function Secrets

These are configured in your Supabase project dashboard under **Edge Functions > Secrets**.

#### Required for Email Sending (Choose SMTP or Resend)

**Option 1: Standard SMTP Server (Gmail, SendGrid, AWS SES, or custom SMTP)**

| Secret | Description | Example |
|--------|-------------|---------|
| `SMTP_HOST` | Host address of SMTP relay server | `smtp.gmail.com` or `smtp.mailgun.org` |
| `SMTP_PORT` | Port of SMTP service (STARTTLS / SSL) | `587` or `465` |
| `SMTP_USER` | SMTP username for authentication | `user@gmail.com` |
| `SMTP_PASS` | SMTP password or app-specific password | `xxxx xxxx xxxx xxxx` |
| `SMTP_FROM` | Envelope display sender address | `onboarding@yourcompany.com` |
| `PORTAL_URL` | URL where interns access the portal | `https://your-app.vercel.app/portal` |

**Option 2: Resend API Integration**

| Secret | Description | How to Get |
|--------|-------------|------------|
| `RESEND_API_KEY` | Resend API key for sending emails | 1. Sign up at [resend.com](https://resend.com) 2. Add and verify your sending domain 3. Go to API Keys and create a new key |
| `RESEND_FROM_EMAIL` | Sender email address (must be verified in Resend) | e.g., `onboarding@yourcompany.com` |
| `PORTAL_URL` | URL where interns access the portal | e.g., `https://your-app.vercel.app/portal` |

#### Required for OCR Document Verification (Open Source - Cost Free!)

Choose ONE of these cost-effective options:

**Option 1: Ollama (Self-Hosted, Free)**

| Secret | Description | How to Get |
|--------|-------------|------------|
| `OCR_MODE` | Set to `ollama` | Type: `ollama` |
| `OLLAMA_URL` | URL to your Ollama instance | Default: `http://localhost:11434` |
| `OCR_MODEL` | Model to use | e.g., `llava`, `llava-phi`, or `bakllava` |

Setup: `ollama pull llava` then run `ollama serve`

**Option 2: Hugging Face (Free Tier Available)**

| Secret | Description | How to Get |
|--------|-------------|------------|
| `OCR_MODE` | Set to `huggingface` | Type: `huggingface` |
| `HUGGINGFACE_API_KEY` | Free API key from [huggingface.co](https://huggingface.co) | 1. Create account 2. Generate API key 3. Free tier: 30k requests/month |
| `HUGGINGFACE_MODEL` | Model to use | Default: `Salesforce/blip-image-captioning-base` (free) |

**Option 3: Simulated OCR (Development)**

| Secret | Description |
|--------|-------------|
| `OCR_MODE` | Set to `simulated` or leave blank |

No API key needed. Returns mock data for testing.

**Recommended Models (Free):**
- **Ollama**: `llava` (8GB VRAM), `llava-phi` (4GB), `bakllava` (13GB, more accurate)
- **Hugging Face**: `Salesforce/blip-image-captioning-base` (free tier), `Salesforce/blip-image-captioning-large` (paid)

#### Required for Company Email Assignment

| Secret | Description | Example |
|--------|-------------|---------|
| `COMPANY_EMAIL_DOMAIN` | Domain for company emails | `yourcompany.com` |

#### Auto-Configured (Do Not Set Manually)

| Secret | Description |
|--------|-------------|
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key for admin operations |
| `SUPABASE_ANON_KEY` | Anonymous key for client operations |
| `SUPABASE_DB_URL` | Database connection URL |

## Setting Up Resend

1. **Create Account**: Go to [resend.com](https://resend.com) and sign up
2. **Verify Domain**: Add your sending domain and configure DNS records (SPF, DKIM, DMARC)
3. **Create API Key**: Go to API Keys > Create API Key > Give full access
4. **Set Secrets**: In Supabase dashboard, go to Edge Functions > Secrets and add:
   - `RESEND_API_KEY` = `re_xxxxxxxxxxxx`
   - `RESEND_FROM_EMAIL` = `onboarding@yourdomain.com`
   - `PORTAL_URL` = `https://your-deployed-app.com/portal`

## Setting Up OCR (Cost-Free Options!)

### Option 1: Ollama (Self-Hosted, Completely Free)

**Pros:** No API calls, full privacy, completely free
**Cons:** Requires local server/GPU

1. **Install Ollama**: Download from [ollama.ai](https://ollama.ai)
2. **Pull a Vision Model**:
   ```bash
   ollama pull llava  # 8GB, good balance
   # OR
   ollama pull llava-phi  # 4GB, lighter
   # OR
   ollama pull bakllava  # 13GB, more accurate
   ```
3. **Start Ollama Server**:
   ```bash
   ollama serve  # Runs on http://localhost:11434
   ```
4. **Set Supabase Secrets**:
   - `OCR_MODE` = `ollama`
   - `OLLAMA_URL` = `http://localhost:11434` (adjust for remote)
   - `OCR_MODEL` = `llava` (or your chosen model)

**Cost**: $0 (just server infrastructure)

### Option 2: Hugging Face (Free Tier Available)

**Pros:** Free tier with 30k requests/month, no setup needed
**Cons:** Requires API key, rate limited

1. **Create Account**: Go to [huggingface.co](https://huggingface.co)
2. **Generate API Key**: Settings > Access Tokens > New token (read access)
3. **Set Supabase Secrets**:
   - `OCR_MODE` = `huggingface`
   - `HUGGINGFACE_API_KEY` = your API key
   - `HUGGINGFACE_MODEL` = `Salesforce/blip-image-captioning-base` (free) or `Salesforce/blip-image-captioning-large` (premium)

**Cost**: Free tier: $0 (30k requests/month), Paid: $0.01-0.05 per request

### Option 3: Simulated OCR (Development/Testing)

For testing without any real OCR processing:

1. **Set Supabase Secret**:
   - `OCR_MODE` = `simulated` (or leave blank)

Returns mock extracted data immediately. No API keys needed.

**Cost**: $0

### Comparison Table

| Option | Cost | Speed | Accuracy | Setup |
|--------|------|-------|----------|-------|
| Ollama (local) | $0 | Fast | High | Complex |
| Ollama (remote server) | Low | Medium | High | Moderate |
| Hugging Face (free) | $0 | Slow | Medium | Simple |
| Hugging Face (paid) | Low | Fast | High | Simple |
| Simulated | $0 | Instant | Mock | None |

### Recommended Setup

**For Production (Best Balance):**
- **Small Scale**: Ollama + llava-phi on modest server ($5-10/month)
- **Large Scale**: Hugging Face paid tier or self-hosted Ollama on GPU

**For Development:**
- Simulated OCR (instant, no setup)

**For Staging:**
- Hugging Face free tier (30k requests/month)

## Database Schema

### Core Tables

| Table | Purpose |
|-------|---------|
| `interns` | Intern records with onboarding status tracking |
| `documents` | Uploaded documents with OCR results |
| `extracted_doc_data` | Structured data extracted from documents (for IT dashboard) |
| `onboarding_steps` | Step-by-step onboarding progress |
| `inventory_items` | Catalog of available inventory |
| `inventory_allotments` | Items assigned to interns |
| `agent_logs` | Audit trail of all agent actions |
| `email_logs` | Track all emails sent by the system |
| `company_emails` | Track company email assignments and migrations |

### Key Intern Fields

| Field | Description |
|-------|-------------|
| `email` | Current email (changes after company email assignment) |
| `personal_email` | Original personal email (preserved) |
| `company_email` | Assigned company email |
| `password_changed` | Whether intern changed initial password |
| `offer_letter_signed` | Whether offer letter was e-signed |
| `onboarding_status` | Current pipeline status |

### Onboarding Status Flow

```
invited -> first_login -> docs_uploaded -> ocr_processing -> verified
-> company_email_assigned -> inventory_allotted -> completed
```

### Onboarding Steps

| Step | Order | Description |
|------|-------|-------------|
| `email_sent` | 1 | Onboarding email with credentials sent |
| `password_changed` | 2 | Intern changed initial password |
| `document_upload` | 3 | Intern uploaded required documents |
| `ocr_verification` | 4 | AI agent verified documents |
| `company_email_assigned` | 5 | Company email created and credentials sent |
| `inventory_allotment` | 6 | Equipment and items assigned |
| `onboarding_complete` | 7 | All steps done |

## Document Types

| Type | Label | Required | OCR Extracts |
|------|-------|----------|-------------|
| `aadhaar` | Aadhaar Card | Yes | Name, DOB, Aadhaar number, address, gender |
| `pan` | PAN Card | Yes | Name, father's name, PAN number, DOB, type |
| `bank_passbook` | Bank Passbook | Yes | Account holder, account number, bank, IFSC, branch |
| `offer_letter` | Offer Letter | Yes | Candidate name, company, position, department, start date, CTC |

## Company Email Migration

When documents are verified, the system:

1. Generates a company email: `firstname.lastname@companydomain.com`
2. Creates a new auth user with the company email
3. Migrates the intern's profile to the new user
4. Updates all related records (documents, allotments, steps)
5. Deletes the old auth user (personal email)
6. Sends credentials to the intern's personal email
7. Intern must log in with the new company email and change password again

## Edge Functions

| Function | Purpose | JWT Required |
|----------|---------|-------------|
| `add-intern` | Create intern + trigger invite email | Yes |
| `send-email` | Send emails via Resend | No |
| `verify-documents` | OCR verification of uploaded docs | No |
| `assign-company-email` | Create company email + migrate user | No |
| `onboarding-agent` | Allot inventory + complete onboarding | No |
| `setup-admin` | Create admin user (dev tool) | No |

## Security Notes

- All tables have Row Level Security (RLS) enabled
- Interns can only access their own data
- Admins can access all data
- Edge functions use service role key for admin operations
- Password change is enforced on first login
- Company email migration removes the old auth user entirely
- All agent actions are logged in `agent_logs` for audit

## Development Setup

1. Clone the repository
2. Copy `.env.example` to `.env` and fill in Supabase credentials
3. Run `npm install`
4. Run `npm run dev` to start the development server
5. Set up edge function secrets in Supabase dashboard

## Testing the Flow

1. Log in as admin (admin@internhub.com / Admin@2026!)
2. Go to Interns > Add Intern
3. Enter name, email, department only
4. The agent will:
   - Create the intern account
   - Send onboarding email with credentials
5. Log in as the intern (use credentials from the success dialog)
6. Change password when prompted
7. Upload 4 documents (Aadhaar, PAN, Bank Passbook, Offer Letter)
8. Click "Submit for Verification"
9. The OCR agent will process documents (simulated if no LLM key)
10. After verification, company email is assigned automatically
11. Inventory is allotted automatically
12. Onboarding is marked complete

## Troubleshooting

### Emails not sending
- Verify `RESEND_API_KEY` is set in Supabase Edge Function secrets
- Verify `RESEND_FROM_EMAIL` domain is verified in Resend
- Check `email_logs` table for failed sends

### OCR not extracting real data

**If using Ollama:**
- Verify `OCR_MODE` = `ollama`
- Check that Ollama server is running: `curl http://localhost:11434/api/tags`
- Verify model is installed: `ollama list`
- Check `agent_logs` for connection errors

**If using Hugging Face:**
- Verify `OCR_MODE` = `huggingface`
- Verify `HUGGINGFACE_API_KEY` is set correctly
- Check rate limits: Free tier is 30k requests/month
- Check `agent_logs` for API errors

**If using Simulated:**
- This is expected behavior - OCR returns mock data for development

### Company email not being assigned
- Verify `COMPANY_EMAIL_DOMAIN` is set
- Check that documents are verified first (status = "verified")
- Check `agent_logs` for assignment errors

### Intern can't log in after company email migration
- The old personal email auth user is deleted
- Intern must use the new company email to log in
- Check `company_emails` table for migration status
- New credentials are sent to the personal email
