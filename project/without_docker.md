# Running Without Docker

This guide explains how to run the Agentic Employee Onboarding System **without Docker** and **without installing PostgreSQL, Redis, or other server software locally**.

You run all Python microservices and the frontend from your terminal. **PostgreSQL** is hosted on **Supabase**, and **Redis** is hosted on a free cloud provider (**Upstash** recommended). No local database or cache installation is required.

For architecture details, see [architecture.md](./architecture.md). For a project overview, see [README.md](./README.md).

---

## Table of Contents

- [Recommended Approach](#recommended-approach)
- [Cloud Architecture](#cloud-architecture)
- [What Runs Locally vs in the Cloud](#what-runs-locally-vs-in-the-cloud)
- [Prerequisites](#prerequisites)
- [Step 1: Create a Supabase Project (PostgreSQL)](#step-1-create-a-supabase-project-postgresql)
- [Step 2: Create Upstash Redis (Event Bus)](#step-2-create-upstash-redis-event-bus)
- [Step 3: Configure Environment Variables](#step-3-configure-environment-variables)
- [Step 4: Bootstrap the Supabase Database](#step-4-bootstrap-the-supabase-database)
- [Step 5: Set Up Python Virtual Environment](#step-5-set-up-python-virtual-environment)
- [Step 6: Install Python Dependencies](#step-6-install-python-dependencies)
- [Step 7: Start All Backend Services from Terminal](#step-7-start-all-backend-services-from-terminal)
- [Step 8: Start the Frontend](#step-8-start-the-frontend)
- [Step 9: Verify Everything Works](#step-9-verify-everything-works)
- [Startup Script Reference](#startup-script-reference)
- [Troubleshooting](#troubleshooting)
- [Service URL Reference](#service-url-reference)
- [Alternative: Local PostgreSQL and Redis](#alternative-local-postgresql-and-redis)

---

## Recommended Approach

| Component | Where it runs | Install locally? |
|-----------|---------------|------------------|
| PostgreSQL | **Supabase** (hosted) | No |
| Redis event bus | **Upstash Redis** (hosted) | No |
| API Gateway, Orchestrator, 5 microservices | Your terminal | Python only |
| Frontend | Your terminal | Node.js only |
| OCR (Tesseract) | Optional | No — use **Groq Vision** instead |
| Prometheus / Grafana | Skip for local dev | No |

```mermaid
graph TB
    subgraph Local["Your Machine — Terminal Only"]
        FE[Vite Frontend :5173]
        GW[Gateway :8000]
        ORCH[Orchestrator]
        OCR[OCR :8001]
        VS[Verification :8002]
        NS[Notification :8003]
        INV[Inventory :8004]
        ITS[IT :8005]
    end

    subgraph Cloud["Cloud — No Local Install"]
        SB[(Supabase PostgreSQL)]
        UP[(Upstash Redis)]
        GROQ[Groq API — optional OCR/LLM]
        SMTP[SMTP — optional email]
    end

    FE --> GW
    GW --> OCR
    GW --> VS
    GW --> SB
    GW --> UP
    ORCH --> UP
    ORCH --> NS
    ORCH --> ITS
    ORCH --> INV
    ORCH --> SB
    VS --> SB
    NS --> SB
    INV --> SB
    ITS --> SB
    OCR --> GROQ
    VS --> GROQ
    NS --> SMTP
```

**Important:** The **Orchestrator must be running** in a terminal for async workflow steps (welcome emails, IT provisioning, inventory assignment). Events are published to Upstash Redis and consumed by the orchestrator process on your machine.

---

## Cloud Architecture

```mermaid
sequenceDiagram
    participant Term as Your Terminal
    participant GW as Gateway :8000
    participant SB as Supabase Postgres
    participant UP as Upstash Redis
    participant ORCH as Orchestrator

    Term->>GW: python apps/gateway/main.py
    Term->>ORCH: python apps/orchestrator/orchestrator.py
    GW->>SB: asyncpg queries
    GW->>UP: publish CandidateCreatedEvent
    UP->>ORCH: BRPOP onboarding_events
    ORCH->>SB: update session / workflow
```

### Why Supabase for PostgreSQL?

- Supabase provides a **managed PostgreSQL** database — same engine the Docker stack uses.
- The active runtime schema comes from `packages/shared_utils/init_db.py` (not from `supabase/migrations/`, which is a separate legacy schema).
- All Python services connect via `DATABASE_URL` using `asyncpg` — no code changes needed beyond SSL for remote connections.

### Why Upstash for Redis?

- Supabase does **not** provide Redis. The event bus in `packages/event_contracts/broker.py` requires a Redis-compatible server.
- **Upstash Redis** offers a free tier, a standard `REDIS_URL`, and works with the existing `redis.asyncio` client — no code changes.
- Alternatives: [Redis Cloud](https://redis.io/cloud/) free tier, [Railway Redis](https://railway.app/).

---

## What Runs Locally vs in the Cloud

| Docker Container | Without Docker (this guide) |
|------------------|----------------------------|
| `postgres:5432` | **Supabase PostgreSQL** (cloud) |
| `redis:6379` | **Upstash Redis** (cloud) |
| `db-init` | One-time `init_db` + `seed_db` against Supabase |
| `api-gateway:8000` | `python apps/gateway/main.py` |
| `orchestrator` | `python apps/orchestrator/orchestrator.py` |
| `ocr-service:8001` | `python services/ocr-service/main.py` |
| `verification-service:8002` | `python services/verification-service/main.py` |
| `notification-service:8003` | `python services/notification-service/main.py` |
| `inventory-service:8004` | `python services/inventory-service/main.py` |
| `it-service:8005` | `python services/it-service/main.py` |
| `prometheus` / `grafana` | Skip (optional for production) |
| Frontend | `npm run dev` on port 5173 |

---

## Prerequisites

Install **only** these on your machine:

| Requirement | Version | Required |
|-------------|---------|----------|
| Python | 3.11+ | Yes |
| Node.js | 18+ | Yes |
| npm | 9+ | Yes |
| Supabase account | Free tier | Yes |
| Upstash account | Free tier | Yes |
| Groq API key | — | Recommended (OCR without Tesseract) |
| SMTP credentials | — | Optional (mock email mode works without) |
| Tesseract OCR | — | **Not required** if `GROQ_API_KEY` is set |

### Install Python and Node (no PostgreSQL / Redis)

**Windows (PowerShell):**

```powershell
winget install Python.Python.3.11
winget install OpenJS.NodeJS.LTS
```

**macOS:**

```bash
brew install python@3.11 node
```

**Linux (Ubuntu/Debian):**

```bash
sudo apt update
sudo apt install -y python3.11 python3.11-venv nodejs npm
```

---

## Step 1: Create a Supabase Project (PostgreSQL)

1. Go to [https://supabase.com](https://supabase.com) and create a free project.
2. Choose a region close to you and set a **database password** — save it securely.
3. Wait for the project to finish provisioning (~2 minutes).

### Get your connection string

1. Open your project → **Project Settings** → **Database**.
2. Under **Connection string**, select **URI**.
3. Copy the **Session pooler** or **Direct connection** URI.

**Direct connection (recommended for local long-running services):**

```
postgresql://postgres.[PROJECT_REF]:[YOUR_PASSWORD]@aws-0-[REGION].pooler.supabase.com:5432/postgres
```

Or the direct host form:

```
postgresql://postgres:[YOUR_PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres
```

Replace `[YOUR_PASSWORD]` with your database password. If the password contains special characters, URL-encode them (e.g. `@` → `%40`).

### Get Supabase API keys (optional — JWT fallback auth)

From **Project Settings** → **API**:

| Variable | Where to find |
|----------|---------------|
| `VITE_SUPABASE_URL` | Project URL, e.g. `https://xxxxx.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | `anon` `public` key |

### Schema note

Use `packages/shared_utils/init_db.py` to create tables. **Do not** rely on `supabase/migrations/` for this stack — those migrations define a different legacy schema (`documents`, `onboarding_tasks`, etc.) that is not used by the active gateway/orchestrator services.

---

## Step 2: Create Upstash Redis (Event Bus)

1. Go to [https://upstash.com](https://upstash.com) and sign up (free tier available).
2. Click **Create Database** → choose a region near your Supabase project.
3. Enable **TLS** (default on Upstash).
4. Copy the **Redis URL** from the dashboard. It looks like:

```
rediss://default:AbCdEf123456@us1-example-12345.upstash.io:6379
```

Note the `rediss://` prefix (TLS). The existing `RedisEventBus` in `packages/event_contracts/broker.py` accepts this URL via the `REDIS_URL` environment variable — no code changes required.

Set this as `REDIS_URL` in your `.env` file.

### Upstash alternatives

| Provider | Free tier | URL format |
|----------|-----------|------------|
| [Upstash](https://upstash.com) | Yes | `rediss://...` |
| [Redis Cloud](https://redis.io/cloud/) | Yes | `redis://` or `rediss://` |
| [Railway](https://railway.app) | Trial credits | `redis://...` |

---

## Step 3: Configure Environment Variables

Create or edit `.env` in the project root (`project/.env`):

```env
# ── Supabase PostgreSQL (required) ──
DATABASE_URL=postgresql://postgres:[YOUR_PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres

# ── Upstash Redis (required) ──
REDIS_URL=rediss://default:[YOUR_UPSTASH_TOKEN]@[YOUR_UPSTASH_HOST]:6379

# ── Supabase API (optional — JWT fallback + frontend) ──
VITE_SUPABASE_URL=https://[PROJECT_REF].supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key

# ── JWT ──
JWT_SECRET_KEY=onboarding-super-secret-key-2025

# ── Service URLs (all run on localhost) ──
OCR_SERVICE_URL=http://localhost:8001
VERIFICATION_SERVICE_URL=http://localhost:8002
NOTIFICATION_SERVICE_URL=http://localhost:8003
INVENTORY_SERVICE_URL=http://localhost:8004
IT_SERVICE_URL=http://localhost:8005
FRONTEND_URL=http://localhost:5173
COMPANY_DOMAIN=company.com

# ── Groq (recommended — OCR without Tesseract) ──
GROQ_API_KEY=your-groq-api-key
OPENAI_BASE_URL=https://api.groq.com/openai/v1
VISION_MODEL=llama-3.2-11b-vision-preview
OPENAI_MODEL=llama-3.3-70b-versatile

# ── Email (optional — mock mode if unset) ──
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password
EMAIL_FROM=your-email@gmail.com
EMAIL_FROM_NAME=MAQ Onboarding
```

### Set PYTHONPATH

Required for gateway and orchestrator to import agents and packages.

**Windows (PowerShell):**

```powershell
$env:PYTHONPATH = "D:\intern\project;D:\intern\project\packages;D:\intern\project\agents"
```

**macOS/Linux:**

```bash
export PYTHONPATH="/path/to/project:/path/to/project/packages:/path/to/project/agents"
```

### Load `.env` into your shell

**Windows (PowerShell):**

```powershell
Get-Content .env | ForEach-Object {
  if ($_ -match '^\s*([^#][^=]+)=(.*)$') {
    [Environment]::SetEnvironmentVariable($matches[1].Trim(), $matches[2].Trim(), 'Process')
  }
}
```

**macOS/Linux:**

```bash
set -a && source .env && set +a
```

---

## Step 4: Bootstrap the Supabase Database

Supabase requires **SSL** for remote PostgreSQL connections. The stock `init_db.py` and `seed_db.py` scripts use a plain `asyncpg.connect(DATABASE_URL)` without SSL, so use the bootstrap script below for cloud databases.

### One-time bootstrap script

Create `scripts/bootstrap_supabase.py` in the project root:

```python
"""One-time schema + seed for Supabase (or any remote Postgres requiring SSL)."""
import asyncio
import os
import sys

import asyncpg
from passlib.hash import bcrypt

# Allow imports from packages/shared_utils
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "packages", "shared_utils"))

from init_db import INIT_SQL  # noqa: E402

DATABASE_URL = os.getenv("DATABASE_URL", "")
if not DATABASE_URL:
    raise SystemExit("Set DATABASE_URL before running this script.")


async def connect():
    return await asyncpg.connect(DATABASE_URL, ssl="require")


async def seed(conn):
    admin_pw = bcrypt.hash("Admin@123")
    hr_pw = bcrypt.hash("Hr@12345")
    it_pw = bcrypt.hash("It@12345")
    mgr_pw = bcrypt.hash("Manager@123")
    cand_pw = bcrypt.hash("Candidate@123")

    users = [
        ("Admin User", "admin@company.com", admin_pw, "admin"),
        ("HR Manager", "hr1@company.com", hr_pw, "hr"),
        ("IT Specialist", "it1@company.com", it_pw, "it"),
        ("Engineering Manager", "manager1@company.com", mgr_pw, "manager"),
        ("John Candidate", "candidate1@company.com", cand_pw, "candidate"),
    ]

    user_ids = {}
    for name, email, pw, role in users:
        user_id = await conn.fetchval(
            "INSERT INTO users (name, email, hashed_password, role) "
            "VALUES ($1, $2, $3, $4) ON CONFLICT (email) DO UPDATE SET name=$1 RETURNING id",
            name, email, pw, role,
        )
        user_ids[email] = user_id
        print(f"User: {email} -> ID: {user_id}")

    candidate_id = await conn.fetchval(
        "INSERT INTO candidates (user_id, status, department, job_title) "
        "VALUES ($1, 'applied', 'Engineering', 'Software Engineer') "
        "ON CONFLICT (user_id) DO UPDATE SET status='applied' RETURNING id",
        user_ids["candidate1@company.com"],
    )
    print(f"Candidate: candidate1@company.com -> ID: {candidate_id}")

    assets = [
        ("LAPTOP-001", "laptop", "MacBook Pro 16", "SN-MBP16-001"),
        ("LAPTOP-002", "laptop", "ThinkPad X1 Carbon", "SN-TPX1-002"),
        ("LAPTOP-003", "laptop", "Dell XPS 15", "SN-DXPS15-003"),
        ("ACC-001", "accessories", "Dell 24 Monitor", "SN-MON-001"),
        ("ACC-002", "accessories", "Apple Magic Keyboard & Mouse", "SN-KYBD-002"),
        ("ACC-003", "accessories", "Logitech MX Master 3", "SN-MXM3-003"),
    ]
    for tag, asset_type, model, serial in assets:
        await conn.execute(
            "INSERT INTO inventory_assets (asset_tag, asset_type, model, serial_number, status) "
            "VALUES ($1, $2, $3, $4, 'available') ON CONFLICT (asset_tag) DO NOTHING",
            tag, asset_type, model, serial,
        )
        print(f"Asset: {tag} seeded.")


async def main():
    print(f"Connecting to Supabase...")
    conn = await connect()
    print("Initializing schema (drops existing tables)...")
    await conn.execute(INIT_SQL)
    print("Schema ready. Seeding demo data...")
    await seed(conn)
    await conn.close()
    print("Bootstrap completed successfully!")


if __name__ == "__main__":
    asyncio.run(main())
```

Run it once (with `DATABASE_URL` set):

```bash
pip install asyncpg passlib bcrypt==4.0.1
python scripts/bootstrap_supabase.py
```

**Warning:** This script **drops and recreates all tables** (same as `init_db.py`). Do not re-run on a database with data you want to keep.

### Verify in Supabase Dashboard

1. Open **Table Editor** in your Supabase project.
2. Confirm tables exist: `users`, `candidates`, `onboarding_sessions`, `inventory_assets`, etc.
3. Confirm demo users are present (`hr1@company.com`, `candidate1@company.com`, etc.).

### SSL note for running services

Remote Supabase connections from the gateway, orchestrator, and microservices also require SSL. If you see `SSL connection required` errors when starting services, set this environment variable before launching Python processes:

**Windows (PowerShell):**

```powershell
$env:DATABASE_SSL = "require"
```

**macOS/Linux:**

```bash
export DATABASE_SSL=require
```

The application reads `DATABASE_URL` directly. If SSL errors persist at runtime, the services use the same `asyncpg.connect(DATABASE_URL)` pattern as `init_db.py`. In that case, use the **Supabase Session pooler** connection string (port `5432` on the pooler host) which handles SSL at the proxy layer, or apply the same `ssl="require"` pattern in a local patch to the connect calls. The Session pooler URI from the Supabase dashboard typically works without additional changes.

---

## Step 5: Set Up Python Virtual Environment

```bash
cd project
python -m venv .venv
```

**Activate:**

Windows (PowerShell):

```powershell
.\.venv\Scripts\Activate.ps1
```

macOS/Linux:

```bash
source .venv/bin/activate
```

---

## Step 6: Install Python Dependencies

```bash
pip install -r apps/gateway/requirements.txt
pip install -r apps/orchestrator/requirements.txt
pip install -r services/ocr-service/requirements.txt
pip install -r services/verification-service/requirements.txt
pip install -r services/notification-service/requirements.txt
pip install -r services/inventory-service/requirements.txt
pip install -r services/it-service/requirements.txt
```

---

## Step 7: Start All Backend Services from Terminal

Start **7 Python processes** in separate terminals. Load `.env` and set `PYTHONPATH` in each session (or use the startup script below).

```mermaid
flowchart TD
    A[1. Supabase + Upstash ready] --> B[2. Microservices :8001–8005]
    B --> C[3. Gateway :8000]
    B --> D[4. Orchestrator]
    C --> E[5. Frontend :5173]
    D --> E
```

| Terminal | Command | Port |
|----------|---------|------|
| 1 | `cd services/ocr-service && python main.py` | 8001 |
| 2 | `cd services/verification-service && python main.py` | 8002 |
| 3 | `cd services/notification-service && python main.py` | 8003 |
| 4 | `cd services/inventory-service && python main.py` | 8004 |
| 5 | `cd services/it-service && python main.py` | 8005 |
| 6 | `cd project && python apps/gateway/main.py` | 8000 |
| 7 | `cd project && python apps/orchestrator/orchestrator.py` | — |

Verify each service:

```bash
curl http://localhost:8000/health
curl http://localhost:8001/health
curl http://localhost:8002/health
curl http://localhost:8003/health
curl http://localhost:8004/health
curl http://localhost:8005/health
```

Expected orchestrator log:

```
Connected to Redis Event Bus
Started listening for events on 'onboarding_events' queue...
```

---

## Step 8: Start the Frontend

```bash
cd project
npm install
npm run dev
```

Open **http://localhost:5173**

The frontend connects to the gateway at `http://localhost:8000` (hardcoded in `src/api/client.js`).

---

## Step 9: Verify Everything Works

### Login test

```bash
curl -X POST http://localhost:8000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"hr1@company.com","password":"Hr@12345"}'
```

### End-to-end workflow

```mermaid
sequenceDiagram
    participant You
    participant FE as Frontend :5173
    participant GW as Gateway :8000
    participant SB as Supabase
    participant UP as Upstash Redis
    participant ORCH as Orchestrator

    You->>FE: Login as hr1@company.com
    You->>FE: Invite new candidate
    FE->>GW: POST /hr/invite
    GW->>SB: create user + candidate
    GW->>UP: CandidateCreatedEvent
    UP->>ORCH: consume event
    ORCH->>SB: update session step

    You->>FE: Login as candidate
    You->>FE: E-sign, bank verify, upload PDFs
    FE->>GW: candidate routes
    GW->>UP: VerificationCompletedEvent
    UP->>ORCH: IT + Inventory parallel
    ORCH->>SB: status → onboarded
```

1. Log in as **hr1@company.com** / **Hr@12345**
2. Invite a test candidate
3. Log in as the candidate → e-sign, verify bank, upload PDFs
4. Log in as **it1@company.com** → confirm KYC and assigned assets
5. Check Supabase **Table Editor** → `candidates.status` should be `onboarded`

### Automated test

```bash
python scratch/test_flow.py
```

---

## Startup Script Reference

### Windows PowerShell — `start-local.ps1`

```powershell
$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path

# Load .env
Get-Content "$projectRoot\.env" | ForEach-Object {
  if ($_ -match '^\s*([^#][^=]+)=(.*)$') {
    [Environment]::SetEnvironmentVariable($matches[1].Trim(), $matches[2].Trim(), 'Process')
  }
}

$env:PYTHONPATH = "$projectRoot;$projectRoot\packages;$projectRoot\agents"

$services = @(
  @{ Name = "OCR";          Path = "$projectRoot\services\ocr-service";           Script = "main.py" },
  @{ Name = "Verification"; Path = "$projectRoot\services\verification-service"; Script = "main.py" },
  @{ Name = "Notification"; Path = "$projectRoot\services\notification-service"; Script = "main.py" },
  @{ Name = "Inventory";    Path = "$projectRoot\services\inventory-service";    Script = "main.py" },
  @{ Name = "IT";           Path = "$projectRoot\services\it-service";           Script = "main.py" },
  @{ Name = "Gateway";      Path = "$projectRoot";                               Script = "apps\gateway\main.py" },
  @{ Name = "Orchestrator"; Path = "$projectRoot";                               Script = "apps\orchestrator\orchestrator.py" }
)

foreach ($svc in $services) {
  Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$($svc.Path)'; python $($svc.Script)"
  Start-Sleep -Seconds 2
}

Write-Host "Backend services starting. DATABASE_URL -> Supabase, REDIS_URL -> Upstash"
Write-Host "Start frontend: npm run dev"
```

### macOS/Linux — `start-local.sh`

```bash
#!/usr/bin/env bash
set -e
PROJECT_ROOT="$(cd "$(dirname "$0")" && pwd)"
set -a && source "$PROJECT_ROOT/.env" && set +a
export PYTHONPATH="$PROJECT_ROOT:$PROJECT_ROOT/packages:$PROJECT_ROOT/agents"

start_service() {
  local dir="$1" cmd="$2"
  osascript -e "tell app \"Terminal\" to do script \"cd '$dir' && $cmd\"" 2>/dev/null \
    || gnome-terminal -- bash -c "cd '$dir' && $cmd; exec bash" 2>/dev/null \
    || (cd "$dir" && $cmd &)
  sleep 1
}

start_service "$PROJECT_ROOT/services/ocr-service" "python main.py"
start_service "$PROJECT_ROOT/services/verification-service" "python main.py"
start_service "$PROJECT_ROOT/services/notification-service" "python main.py"
start_service "$PROJECT_ROOT/services/inventory-service" "python main.py"
start_service "$PROJECT_ROOT/services/it-service" "python main.py"
start_service "$PROJECT_ROOT" "python apps/gateway/main.py"
start_service "$PROJECT_ROOT" "python apps/orchestrator/orchestrator.py"

echo "Backend started. Run: npm run dev"
```

---

## Troubleshooting

| Problem | Cause | Fix |
|---------|-------|-----|
| `SSL connection required` | Supabase requires TLS | Use Session pooler URI from Supabase dashboard, or run `bootstrap_supabase.py` which uses `ssl="require"` |
| `Connection refused` to Postgres | Wrong `DATABASE_URL` or password | Verify URI in Supabase → Settings → Database; URL-encode special chars in password |
| `Connection refused` to Redis | Wrong `REDIS_URL` | Copy exact URL from Upstash dashboard; use `rediss://` for TLS |
| `NOAUTH Authentication required` | Upstash token wrong | Re-copy the full Redis URL including password token |
| Welcome email not sent | Orchestrator not running | Start `python apps/orchestrator/orchestrator.py` |
| IT/inventory not provisioned | Orchestrator down or KYC incomplete | Check orchestrator logs; ensure all docs verified + offer signed |
| OCR returns empty text | No Tesseract, no Groq key | Set `GROQ_API_KEY` — Groq Vision is used as fallback |
| `ModuleNotFoundError: agents.*` | PYTHONPATH not set | Set PYTHONPATH to include `project`, `packages`, `agents` |
| Frontend CORS errors | Gateway not running | Start gateway on port 8000 |
| Emails show `sent_mock` | SMTP not configured | Set `SMTP_*` env vars or accept mock mode |
| Tables missing in Supabase | Bootstrap not run | Run `python scripts/bootstrap_supabase.py` |
| Used wrong schema | Ran `supabase/migrations/` | Use `init_db.py` schema via bootstrap script, not legacy migrations |

### Check Upstash Redis queue

Use the **Upstash Console** → your database → **CLI** or **Data Browser**:

```
LLEN onboarding_events
LRANGE onboarding_events 0 -1
LLEN onboarding_dlq
```

After an HR invite, `LLEN onboarding_events` should return to `0` once the orchestrator consumes the event.

### Check Supabase data

Use **Table Editor** or **SQL Editor**:

```sql
SELECT email, role FROM users;
SELECT id, status FROM candidates;
SELECT event_type, created_at FROM workflow_events ORDER BY created_at DESC LIMIT 10;
```

---

## Service URL Reference

| Component | URL / Location | How to start |
|-----------|----------------|--------------|
| API Gateway | http://localhost:8000 | `python apps/gateway/main.py` |
| OCR Service | http://localhost:8001 | `python services/ocr-service/main.py` |
| Verification Service | http://localhost:8002 | `python services/verification-service/main.py` |
| Notification Service | http://localhost:8003 | `python services/notification-service/main.py` |
| Inventory Service | http://localhost:8004 | `python services/inventory-service/main.py` |
| IT Service | http://localhost:8005 | `python services/it-service/main.py` |
| Orchestrator | No HTTP port | `python apps/orchestrator/orchestrator.py` |
| Frontend | http://localhost:5173 | `npm run dev` |
| PostgreSQL | Supabase cloud | Supabase dashboard |
| Redis | Upstash cloud | Upstash dashboard |

### Demo Accounts (after bootstrap)

| Email | Password | Role |
|-------|----------|------|
| admin@company.com | Admin@123 | admin |
| hr1@company.com | Hr@12345 | hr |
| it1@company.com | It@12345 | it |
| manager1@company.com | Manager@123 | manager |
| candidate1@company.com | Candidate@123 | candidate |

---

## Comparison: Docker vs Cloud-Backed Local

```mermaid
graph LR
    subgraph Docker["Docker Compose"]
        DC[docker compose up]
        DC --> PG1[Postgres container]
        DC --> RD1[Redis container]
        DC --> PY1[All Python containers]
    end

    subgraph CloudLocal["Cloud-Backed Local (this guide)"]
        SB2[Supabase Postgres]
        UP2[Upstash Redis]
        PY2[Python from terminal]
        SB2 --> PY2
        UP2 --> PY2
    end
```

| Aspect | Docker Compose | Cloud-backed local (this guide) |
|--------|----------------|----------------------------------|
| PostgreSQL install | Container (automatic) | **Supabase** (free cloud) |
| Redis install | Container (automatic) | **Upstash** (free cloud) |
| Python services | Containers | **Terminal processes** |
| Local software needed | Docker only | Python + Node only |
| Setup time | ~5 min | ~15 min (one-time cloud setup) |
| Best for | Demos, full isolation | Development without Docker |

---

## Alternative: Local PostgreSQL and Redis

If you prefer to run PostgreSQL and Redis on your own machine instead of Supabase and Upstash, you can install them locally:

| Component | Install |
|-----------|---------|
| PostgreSQL 15 | [postgresql.org/download](https://www.postgresql.org/download/) |
| Redis 7 | [Memurai (Windows)](https://www.memurai.com/) or `brew install redis` / `apt install redis-server` |
| Tesseract | Optional if `GROQ_API_KEY` is set |

Use these environment variables:

```env
DATABASE_URL=postgresql://postgres:password@localhost:5432/onboarding_db
REDIS_URL=redis://localhost:6379/0
```

Initialize with the stock scripts (no SSL needed):

```bash
python packages/shared_utils/init_db.py
python packages/shared_utils/seed_db.py
```

All other steps (Python venv, start services from terminal, frontend) are identical to this guide.
