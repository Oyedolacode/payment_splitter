# Payment Splitter — Multi-Branch API Batching Engine

> Middleware SaaS that automatically splits bulk QBO payments across multiple branch locations, eliminating manual Excel reconciliation.

---

## Quick Start

### Prerequisites

- Node.js 20+
- A [Supabase account](https://supabase.com) (free) — for Postgres
- An [Upstash account](https://upstash.com) (free) — for Redis
- A [QuickBooks Online Developer account](https://developer.intuit.com)

---

### Step 1 — Set up Supabase (Postgres)

1. Go to [supabase.com](https://supabase.com) → **New Project**
2. Name it `payment-splitter`, set a strong database password — **save this password**
3. Free tier, pick the region closest to you → **Create Project** (takes ~2 min)
4. Once ready: **Project Settings → Database**
5. Scroll to **Connection string → URI** and copy it:
   ```
   postgresql://postgres:[YOUR-PASSWORD]@db.xxxxxxxxxxxx.supabase.co:5432/postgres
   ```
6. Paste this as `DATABASE_URL` in `backend/.env`

> Replace `[YOUR-PASSWORD]` with the actual password you set in step 2.

---

### Step 2 — Set up Upstash (Redis)

1. Go to [upstash.com](https://upstash.com) → **Create Database**
2. Select **Redis** → name it → pick the region closest to you → **Create**
3. On the database page, copy the **REDIS_URL** (starts with `rediss://`)
4. Paste it as `REDIS_URL` in `backend/.env`

---

### Step 3 — Clone & install

```bash
git clone <your-repo>
cd payment-splitter
npm install
```

---

### Step 4 — Configure environment variables

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env.local
```

Edit `backend/.env`:

```bash
# From Supabase (Step 1)
DATABASE_URL="postgresql://postgres:[PASSWORD]@db.xxxx.supabase.co:5432/postgres"

# From Upstash (Step 2)
REDIS_URL="rediss://default:[TOKEN]@[HOST]:6379"

# Generate JWT_SECRET — paste output of:
# node -e "console.log(require('crypto').randomBytes(64).toString('base64'))"
JWT_SECRET=""

# Generate ENCRYPTION_KEY — paste output of:
# node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
ENCRYPTION_KEY=""

# From developer.intuit.com (Step 6)
QBO_CLIENT_ID=""
QBO_CLIENT_SECRET=""
QBO_REDIRECT_URI="http://localhost:3001/auth/qbo/callback"
QBO_ENVIRONMENT="sandbox"

FRONTEND_URL="http://localhost:3000"
```

---

### Step 5 — Run database migrations

```bash
npm run db:migrate
```

Verify in **Supabase Dashboard → Table Editor** — you should see 4 tables: `firms`, `split_rules`, `payment_jobs`, `audit_entries`.

---

### Step 6 — Start development servers

```bash
npm run dev
```

- **Backend**: http://localhost:3001
- **Frontend**: http://localhost:3000
- **Health check**: http://localhost:3001/health

---

## Project Structure

```
payment-splitter/
├── backend/
│   ├── prisma/
│   │   └── schema.prisma          # Database schema (4 tables)
│   └── src/
│       ├── index.ts               # Fastify server entry point
│       ├── lib/
│       │   ├── config.ts          # Validated env vars (fails fast if missing)
│       │   ├── prisma.ts          # Prisma client singleton
│       │   ├── redis.ts           # ioredis client
│       │   └── encryption.ts     # AES-256-GCM token encryption
│       ├── services/
│       │   ├── qboAuth.ts         # OAuth 2.0 flow + token refresh
│       │   ├── qboClient.ts       # QBO API client (fetch, batch, delete)
│       │   └── splitCalculator.ts # Core split logic (3 modes)
│       ├── workers/
│       │   └── paymentWorker.ts   # BullMQ worker + rollback engine
│       └── routes/
│           ├── auth.ts            # POST /auth/firms, GET /auth/qbo/connect
│           ├── webhooks.ts        # POST /webhooks/qbo
│           ├── rules.ts           # CRUD /api/rules
│           └── jobs.ts            # GET/POST /api/jobs
├── frontend/
│   └── src/app/
│       └── dashboard/page.tsx    # Job history + audit trail UI
└── README.md
```

---

## QBO OAuth Setup

1. Go to [developer.intuit.com](https://developer.intuit.com) → **My Apps** → **Create an app**
2. Select **QuickBooks Online and Payments**
3. Under **Keys & OAuth**, copy your **Client ID** and **Client Secret**
4. Add redirect URI: `http://localhost:3001/auth/qbo/callback`
5. In **Sandbox**, create a test company with:
   - One parent customer (e.g. "Acme Corp")
   - 3 sub-customers (Branch A, B, C)
   - Several open invoices spread across the branches

### Connect a firm to QBO

```bash
# 1. Create a firm record
curl -X POST http://localhost:3001/auth/firms \
  -H "Content-Type: application/json" \
  -d '{"name": "My Accounting Firm"}'
# Returns: { "id": "firm-uuid", "name": "..." }

# 2. Open in your browser (replace FIRM_ID):
http://localhost:3001/auth/qbo/connect?firmId=FIRM_ID
```

---

## Running Tests

```bash
cd backend && npm test
```

20+ unit tests covering the split calculator: proportional, oldest-first, location-priority modes, partial payments, overpayments, rounding, and the invariant assertion.

---

## Key Architecture Decisions

| Decision | Rationale |
|---|---|
| Supabase (Postgres) | Managed cloud DB — no Docker on Windows, free tier covers MVP |
| Upstash (Redis) | Serverless Redis — zero config, free, BullMQ compatible |
| BullMQ job queue | Durable processing; retries survive server restarts |
| AES-256-GCM encryption | OAuth tokens never stored in plaintext |
| Max 30 ops per QBO batch | Hard API limit — violations cause full request rejection |
| Idempotency on payment_id | Duplicate QBO webhooks are safely ignored |
| Rollback before marking failed | Ledger integrity takes priority |
| Invariant assertion pre-write | Allocations must sum to payment amount before any API call |

---

## Build Plan Progress

- [x] **Phase 1** — Infrastructure, Auth, Config (Days 1–5)
- [x] **Phase 2** — Data Ingestion & Rule Builder UI (Days 6–12)
- [x] **Phase 3** — Split Engine Core + Tests (Days 13–20)
- [x] **Phase 4** — Batch Write-Back & Rollback (Days 21–25)
- [x] **Phase 5a** — Audit Logs & Premium Dashboard UI (Day 26)
- [ ] **Phase 5b** — Stripe paywall wired up
- [ ] **Phase 5c** — Production deploy to Railway
