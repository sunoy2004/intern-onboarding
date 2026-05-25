# Agentic Employee Onboarding System

An AI-driven, event-driven employee onboarding platform that automates the full hiring lifecycle: HR invites candidates, KYC document verification (Aadhaar, PAN, bank passbook), e-signing, IT account provisioning, hardware assignment, and email notifications — orchestrated asynchronously via Redis events and cognitive AI agents.

---

## Table of Contents

- [Overview](#overview)
- [Key Features](#key-features)
- [Tech Stack](#tech-stack)
- [System Diagram](#system-diagram)
- [Onboarding Workflow](#onboarding-workflow)
- [Project Structure](#project-structure)
- [Prerequisites](#prerequisites)
- [Environment Variables](#environment-variables)
- [Quick Start (Docker)](#quick-start-docker)
- [Demo Accounts](#demo-accounts)
- [Access URLs](#access-urls)
- [End-to-End Test Flow](#end-to-end-test-flow)
- [Frontend](#frontend)
- [Additional Documentation](#additional-documentation)

---

## Overview

This system replaces a monolithic onboarding flow with a **distributed microservices architecture**. HR creates candidate invites through a React dashboard; candidates complete KYC uploads and e-signatures through a self-service portal; an orchestrator reacts to Redis events to provision IT accounts and assign laptops in parallel once verification completes.

The active runtime stack lives under `apps/`, `agents/`, `services/`, and `packages/`. A legacy `backend/` stack (LangGraph, Celery, RAG) and Supabase migrations exist but are **not wired into Docker Compose**.

---

## Key Features

| Area | Capability |
|------|------------|
| **HR Intake** | Invite candidates, create user accounts, generate temp passwords, publish `CandidateCreatedEvent` |
| **Document Verification** | In-memory PDF OCR (Tesseract + Groq Vision fallback), PAN/Aadhaar/bank validation, no persistent file storage |
| **E-Signing** | Canvas or typed signature with IP and timestamp audit trail |
| **IT Provisioning** | Corporate email (`first.last@company.com`), employee ID, temp password |
| **Inventory** | Laptop + accessory assignment from asset catalog |
| **Notifications** | Welcome email and corporate credentials via SMTP (mock mode when unconfigured) |
| **Auth & RBAC** | JWT login with role-based access: `candidate`, `hr`, `it`, `manager`, `admin` |
| **Monitoring** | Prometheus (9090) and Grafana (3001) containers |

---

## Tech Stack

| Layer | Technologies |
|-------|-------------|
| **Frontend** | React 18, Vite 5, React Router 7, Tailwind CSS, Lucide icons |
| **API Gateway** | FastAPI, JWT (python-jose), bcrypt, asyncpg |
| **Microservices** | FastAPI (OCR, Verification, Notification, Inventory, IT) |
| **Agents** | Python classes orchestrating HTTP calls + Redis events |
| **Event Bus** | Redis (LPUSH/BRPOP queue, Pub/Sub monitoring, DLQ) |
| **Database** | PostgreSQL 15 |
| **AI / OCR** | Tesseract, PyMuPDF, Groq Vision & LLM APIs |
| **Email** | aiosmtplib (SMTP) |
| **Infrastructure** | Docker Compose, Prometheus, Grafana |

---

## System Diagram

```mermaid
graph TB
    subgraph Frontend["Frontend (localhost:5173)"]
        Login[Login Page]
        HRDash[HR Dashboard]
        CandDash[Candidate Dashboard]
        ITDash[IT Dashboard]
    end

    subgraph Gateway["API Gateway :8000"]
        Auth[Auth / RBAC]
        HRRoutes[HR Routes]
        CandRoutes[Candidate Routes]
        ITRoutes[IT Routes]
    end

    subgraph Agents["Cognitive Agents (Python)"]
        HRA[HR Agent]
        VA[Verification Agent]
        NA[Notification Agent]
        ITA[IT Agent]
        INVA[Inventory Agent]
    end

    subgraph Services["Microservices"]
        OCR[OCR Service :8001]
        VS[Verification Service :8002]
        NS[Notification Service :8003]
        INV[Inventory Service :8004]
        ITS[IT Service :8005]
    end

    subgraph Infra["Infrastructure"]
        PG[(PostgreSQL :5432)]
        Redis[(Redis :6379)]
        ORCH[Orchestrator]
        Prom[Prometheus :9090]
        Graf[Grafana :3001]
    end

    Login --> Auth
    HRDash --> HRRoutes
    CandDash --> CandRoutes
    ITDash --> ITRoutes

    HRRoutes --> HRA
    CandRoutes --> VA
    HRA --> PG
    HRA --> Redis
    VA --> OCR
    VA --> VS
    VA --> Redis
    Redis --> ORCH
    ORCH --> NA
    ORCH --> ITA
    ORCH --> INVA
    NA --> NS
    ITA --> ITS
    INVA --> INV
    ITS --> PG
    INV --> PG
    VS --> PG
    NS --> PG
    ORCH --> PG

    Prom -.-> Gateway
    Prom -.-> OCR
    Prom -.-> VS
    Prom -.-> NS
    Prom -.-> INV
    Prom -.-> ITS
    Graf --> Prom
```

---

## Onboarding Workflow

```mermaid
sequenceDiagram
    participant HR as HR Dashboard
    participant GW as API Gateway
    participant HRA as HR Agent
    participant Redis as Redis Event Bus
    participant ORCH as Orchestrator
    participant NA as Notification Agent
    participant CAND as Candidate Portal
    participant VA as Verification Agent
    participant OCR as OCR Service
    participant VS as Verification Service
    participant ITA as IT Agent
    participant INVA as Inventory Agent

    HR->>GW: POST /hr/invite
    GW->>HRA: invite_candidate()
    HRA->>Redis: CandidateCreatedEvent
    Redis->>ORCH: consume event
    ORCH->>NA: send_welcome_email()

    CAND->>GW: POST /candidates/sign (e-sign)
    CAND->>GW: POST /candidates/bank/verify
    CAND->>GW: POST /candidates/documents/upload (PDF)
    GW->>VA: process / verify
    VA->>OCR: POST /ocr/extract
    VA->>VS: POST /verification/verify-document
    VA->>Redis: VerificationCompletedEvent (when all docs verified)

    Redis->>ORCH: consume event
    par Parallel Provisioning
        ORCH->>ITA: provision_employee_account()
        ORCH->>INVA: assign_assets()
    end
    ITA->>Redis: ITAccountProvisionedEvent
    INVA->>Redis: InventoryAssignedEvent
    ORCH->>ORCH: check laptop + account → status: onboarded
```

### Candidate Status Progression

```
applied → documents_pending → documents_verified → it_provisioning → onboarded
```

### Session Steps

```
initiated → welcome_email_sent → provisioning_triggered → completed
```

---

## Project Structure

```
project/
├── apps/
│   ├── gateway/              # FastAPI API Gateway (port 8000)
│   └── orchestrator/         # Redis event consumer / workflow engine
├── agents/
│   ├── hr_agent/             # Candidate invite & intake
│   ├── verification_agent/   # Document OCR + verification orchestration
│   ├── notification_agent/   # Email dispatch via notification service
│   ├── it_agent/             # IT account provisioning
│   └── inventory_agent/      # Hardware assignment
├── services/
│   ├── ocr-service/          # PDF OCR (port 8001)
│   ├── verification-service/ # KYC validation (port 8002)
│   ├── notification-service/ # SMTP email (port 8003)
│   ├── inventory-service/    # Asset catalog (port 8004)
│   └── it-service/           # Corporate account creation (port 8005)
├── packages/
│   ├── event_contracts/      # Redis event bus (broker.py)
│   ├── shared_types/         # Pydantic schemas
│   └── shared_utils/         # init_db.py, seed_db.py
├── src/                      # React frontend (Vite entry)
├── infrastructure/
│   └── prometheus/           # Prometheus scrape config
├── supabase/                 # Supabase migrations & edge functions (optional)
├── backend/                  # Legacy monolith (not in Docker Compose)
├── docker-compose.yml
├── package.json
└── .env                      # Environment configuration
```

---

## Prerequisites

- **Docker** and **Docker Compose** (recommended)
- **Node.js 18+** and **npm** (for frontend)
- Optional: **Groq API key** (enhanced OCR/LLM verification)
- Optional: **SMTP credentials** (real email delivery; mock mode works without them)

For running without Docker, see [without_docker.md](./without_docker.md).

---

## Environment Variables

Create a `.env` file in the project root (`project/.env`):

```env
# Supabase (optional — used for JWT fallback auth)
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key

# AI / OCR (optional — Tesseract works without Groq)
GROQ_API_KEY=your-groq-api-key
OPENAI_BASE_URL=https://api.groq.com/openai/v1
VISION_MODEL=llama-3.2-11b-vision-preview
OPENAI_MODEL=llama-3.3-70b-versatile

# Email (optional — mock mode if unset)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password
EMAIL_FROM=your-email@gmail.com
EMAIL_FROM_NAME=MAQ Onboarding

# Application
FRONTEND_URL=http://localhost:5173
COMPANY_DOMAIN=company.com
```

Docker Compose also sets these internally:

| Variable | Default (Docker) |
|----------|------------------|
| `DATABASE_URL` | `postgresql://postgres:password@postgres:5432/onboarding_db` |
| `REDIS_URL` | `redis://redis:6379/0` |
| `JWT_SECRET_KEY` | `onboarding-super-secret-key-2025` |

---

## Quick Start (Docker)

### 1. Clone and configure

```bash
cd project
cp .env.example .env   # if available, or create .env manually
# Edit .env with your GROQ_API_KEY and SMTP settings (optional)
```

### 2. Start all backend services

```bash
docker compose up --build
```

This starts:

1. **PostgreSQL** (5432) and **Redis** (6379) with health checks
2. **db-init** — runs `init_db.py` + `seed_db.py` (creates schema and demo data)
3. **API Gateway** (8000), **Orchestrator**, and all five microservices
4. **Prometheus** (9090) and **Grafana** (3001)

Wait until all containers report healthy. The `db-init` container exits after seeding — this is expected.

### 3. Start the frontend

In a separate terminal:

```bash
cd project
npm install
npm run dev
```

Open **http://localhost:5173** in your browser.

### 4. Stop services

```bash
docker compose down
```

To remove persisted database volumes:

```bash
docker compose down -v
```

---

## Demo Accounts

Seeded automatically by `packages/shared_utils/seed_db.py`:

| Email | Password | Role |
|-------|----------|------|
| admin@company.com | Admin@123 | admin |
| hr1@company.com | Hr@12345 | hr |
| it1@company.com | It@12345 | it |
| manager1@company.com | Manager@123 | manager |
| candidate1@company.com | Candidate@123 | candidate |

---

## Access URLs

| Service | URL |
|---------|-----|
| Frontend | http://localhost:5173 |
| API Gateway | http://localhost:8000 |
| API Health | http://localhost:8000/health |
| OCR Service | http://localhost:8001/health |
| Verification Service | http://localhost:8002/health |
| Notification Service | http://localhost:8003/health |
| Inventory Service | http://localhost:8004/health |
| IT Service | http://localhost:8005/health |
| Prometheus | http://localhost:9090 |
| Grafana | http://localhost:3001 (admin / admin) |
| PostgreSQL | localhost:5432 |
| Redis | localhost:6379 |

---

## End-to-End Test Flow

A test script is available at `scratch/test_flow.py`:

```bash
# With backend running (Docker or local)
python scratch/test_flow.py
```

**Manual test flow:**

1. Log in as **hr1@company.com** → invite a new candidate
2. Check email (or logs) for temp credentials
3. Log in as the candidate → reset password if prompted
4. E-sign offer letter, verify bank details, upload Aadhaar/PAN/bank PDFs
5. Log in as **it1@company.com** → verify KYC data, corporate email, and assigned laptop
6. Confirm candidate status reaches **onboarded**

---

## Frontend

| Page | Role | Features |
|------|------|----------|
| Login | Public | Email/password login, demo quick-login buttons |
| Candidate Dashboard | candidate | Status timeline, password reset, e-sign, bank verify, PDF uploads |
| HR Dashboard | hr | Invite candidates, list candidates, session events |
| IT Dashboard | it | View candidates, KYC data, assets, corporate email |
| Manager Dashboard | manager | Team overview (partial — some API stubs missing) |
| Admin Dashboard | admin | Stats/users/audit (partial — some API stubs missing) |

The frontend communicates with the gateway at `http://localhost:8000` via `src/api/client.js`.

Build for production:

```bash
npm run build    # Output in dist/
npm run preview  # Preview production build
```

---

## Additional Documentation

| Document | Description |
|----------|-------------|
| [architecture.md](./architecture.md) | Full system architecture, every service, agent, database schema, events |
| [without_docker.md](./without_docker.md) | Run the entire stack locally without Docker |
| [walkthrough.md](../walkthrough.md) | Refactoring notes and verification results |

---

## Known Limitations

- `init_db.py` **drops and recreates** all tables on each run — not suitable for persistent data without modification
- Admin/Manager dashboards call API methods not yet implemented in `client.js`
- HR Dashboard has legacy Supabase document calls that do not work in Docker mode
- Prometheus scrapes `/health` only — no application metrics endpoints exist yet
- Support chat widget expects legacy backend at `/api/support/ask`
