# Outbox Email Scheduler

Production-minded email scheduling application for the Outbox Labs technical assignment (ReachInbox-style scheduling scope). The backend is a **durable asynchronous job-processing system**: PostgreSQL is the source of truth, Redis/BullMQ executes delayed work, and a separate worker delivers mail through Nodemailer and **Ethereal** (test SMTP). The HTTP API never sends mail inline.

## Project overview

An authenticated user can register or log in (email/password or optional Google OAuth), compose plain-text mail, schedule single emails or **bulk campaigns** from recipient lists, and review scheduled, sent, and failed deliveries on a dashboard. Optional Elasticsearch powers user-scoped search when enabled. A worker claims due jobs, enforces spacing and hourly quotas in Redis, sends via configured SMTP sender accounts, and writes `SENT` or `FAILED` back to PostgreSQL.

**Out of scope:** production inbox providers (Gmail, SendGrid, etc.), AI content generation, CRM/contacts beyond parsed recipient lists, and recurring/cancelable schedules.

## Features

- Registration, login, JWT sessions, and `GET /api/auth/me`
- Per-user email ownership (backend-enforced)
- Compose and schedule emails for a future instant
- Bulk **campaign** scheduling from CSV or plain-text recipient lists (staggered sends, Redis-enforced hourly quota)
- Multiple Ethereal SMTP sender accounts (round-robin) plus environment default compatibility
- Redis-backed campaign `minDelayMs` spacing and atomic hourly quotas (UTC hour buckets)
- Slack OAuth for debounced hourly-quota alerts per sender
- Delayed BullMQ jobs (`jobId = email.id`, payload `{ emailId }` only)
- Independent worker with Nodemailer / Ethereal delivery
- Atomic `QUEUED → PROCESSING` claim; `SENT` / `FAILED` outcomes
- BullMQ retries (3 attempts, exponential backoff)
- Worker concurrency and rate limiting
- Startup reconciliation of DB vs queue (including stale `PROCESSING`)
- Dashboard: scheduled, sent, failed; compose (single + campaign); search UI; settings (SMTP, Slack, queue dashboard link)
- Protected Bull Board at `/api/admin/queues` (session cookie via `POST /api/admin/queues/session`)

### Optional integrations (require configuration)

| Integration | When configured | When not configured |
| --- | --- | --- |
| **Google OAuth** | `GET /api/auth/google/start` → Google → callback → frontend exchange | API returns `503 GOOGLE_NOT_CONFIGURED`; email/password auth still works |
| **Elasticsearch** | `GET /api/emails/search`, background outbox indexing, `POST /api/emails/search/reindex` | Search API returns unavailable; UI shows a graceful banner |
| **Slack** | OAuth connect + debounced hourly-quota alerts per sender | Connect URL empty; status shows disconnected |

## Tech stack

| Area | Choice |
| --- | --- |
| Frontend | React, Vite, TypeScript, Tailwind CSS |
| Backend | Node.js, Express, TypeScript |
| Database | PostgreSQL, Prisma |
| Queue | Redis, BullMQ |
| Search (optional) | Elasticsearch 8.x |
| Email | Nodemailer, Ethereal Email (test SMTP) |
| Auth | JWT (`sub` = user id), bcrypt; optional Google OAuth |
| Local infra | Docker Compose: PostgreSQL, Redis, Elasticsearch |

## Architecture

```
Frontend (React)
    ↓  JWT Bearer
Express API
    ↓  persist Email
PostgreSQL (source of truth)
    ↓  enqueue delayed job
BullMQ / Redis
    ↓
Worker (separate Node process)
    ↓
Nodemailer → Ethereal
    ↓  SENT / FAILED
PostgreSQL
    ↓
Dashboard refresh
```

The API process must not send SMTP. The worker must not serve HTTP.

## Scheduling flow

1. Authenticated `POST /api/emails` validates input. `scheduledAt` must include a timezone (`Z` or offset) and be in the future.
2. A row is inserted with `status = SCHEDULED` and `userId` from the JWT (never from the body).
3. A delayed job is added to `email-queue`:
   - name: `send-email`
   - `jobId = email.id`
   - payload: `{ "emailId": "<uuid>" }`
   - `delay = max(0, scheduledAt - now)`
4. On enqueue success: `SCHEDULED → QUEUED`.
5. On enqueue failure: row stays `SCHEDULED`, API returns `503 QUEUE_ENQUEUE_FAILED`.
6. When due, the worker loads the row from PostgreSQL (not from job payload content), atomically claims `QUEUED → PROCESSING`, sends via Ethereal, then writes `SENT` (`sentAt`, `providerMessageId`) or `FAILED` (`failureReason`).

Retryable SMTP failures return the row to `QUEUED` and rethrow so BullMQ retries. The last attempt or a permanent error marks `FAILED`.

## Persistence / restart recovery

PostgreSQL holds business state. BullMQ/Redis is only the execution mechanism. JavaScript timers are not the durable scheduler.

On worker start:

1. Connect to PostgreSQL  
2. Reconcile `SCHEDULED` / `QUEUED` / `PROCESSING` vs jobs `jobId = email.id`  
3. Start the BullMQ worker  

| DB | Queue | Reconciliation |
| --- | --- | --- |
| `SCHEDULED` | missing / completed / failed | Recreate job, then `SCHEDULED → QUEUED` |
| `QUEUED` | missing / completed / failed | Recreate job; stay `QUEUED` |
| Live waiting/delayed/active job | keep it (`jobId` is deterministic) |
| `PROCESSING` + **active** job | do not requeue |
| `PROCESSING`, not active, `updatedAt` older than `EMAIL_PROCESSING_TIMEOUT_MS` | `PROCESSING → QUEUED`, recreate job if needed |
| `SENT` leftover non-active job | remove job; never send again |

If Redis still holds a delayed job and the worker is merely stopped, restarting the worker is enough: the job was never in process memory. Reconciliation exists for **missing** jobs (enqueue crash, Redis loss, stale claim).

## Rate limiting

Applied **only** to worker execution (not login or `POST /api/emails`).

BullMQ worker `limiter`: `EMAIL_RATE_LIMIT_MAX` jobs per `EMAIL_RATE_LIMIT_DURATION_MS` (defaults **2 per 1000ms**). Retries use the same worker, so they are limited too. `PROCESSING` is claimed when the processor actually starts, not while the limiter is holding the job.

## Concurrency

`EMAIL_WORKER_CONCURRENCY` (default **2**) is BullMQ `Worker` `concurrency` on **one** process. It is not three worker processes. Logs include `active=N` on `[worker] job received`.

## Retries

Queue defaults: `attempts = 3`, exponential backoff base `2000ms`. Transient SMTP/network errors retry. Permanent errors (missing Ethereal config, malformed payload, missing row, SMTP 5xx) fail without looping. The processor rethrows after updating DB state so BullMQ does not treat failure as success.

## Authentication

- Register / login issue a JWT immediately. Payload is `{ sub: userId }` plus `iat` / `exp`.
- Passwords hashed with bcrypt (cost 12), minimum length 8.
- Frontend stores the token in **`localStorage`** and sends `Authorization: Bearer` (assignment trade-off, not httpOnly cookies).
- Logout clears the token client-side; there is no server-side session revoke endpoint.
- Email ownership is always `req.user.id` on the server. `GET /api/emails/:id` returns 404 for another user's mail.
- **Google (optional):** `GET /api/auth/google/start` → user signs in at Google → `GET /api/auth/google/callback` → frontend `POST /api/auth/google/exchange` with a one-time code stored in Redis.

## Ethereal setup

```bash
npm run ethereal:create
```

Copy the printed `ETHEREAL_*` values into the repo-root `.env`. Restart the worker. Do not commit credentials. Preview URLs are logged; they are not stored as `providerMessageId`.

If `ETHEREAL_USER` / `ETHEREAL_PASS` are empty, the worker starts but delivery fails permanently and does **not** mark `SENT`.

## Environment variables

Copy `.env.example` to `.env` at the **repo root**. Do not commit `.env`. The backend loads it from the repo root when started via `npm run dev:backend` or `npm run worker` (see `apps/backend/src/config/load-env.ts`).

| Variable | Role |
| --- | --- |
| `NODE_ENV` | `development` / `test` / `production` |
| `PORT` | API port (default **3001**) |
| `FRONTEND_URL` | CORS origin (default `http://127.0.0.1:5173`) |
| `DATABASE_URL` | PostgreSQL (see **Local ports** below) |
| `REDIS_URL` | Redis (see **Local ports** below) |
| `JWT_SECRET` | JWT signing (≥ 16 chars) |
| `JWT_EXPIRES_IN` | e.g. `7d` |
| `ETHEREAL_*`, `MAIL_FROM` | Worker SMTP (Ethereal test inbox) |
| `EMAIL_WORKER_CONCURRENCY` | Max in-flight jobs (default 2) |
| `EMAIL_RATE_LIMIT_MAX` / `EMAIL_RATE_LIMIT_DURATION_MS` | Worker limiter |
| `EMAIL_PROCESSING_TIMEOUT_MS` | Stale `PROCESSING` threshold |
| `CREDENTIALS_ENCRYPTION_KEY` | Encrypts stored SMTP/Slack secrets (defaults to `JWT_SECRET` in dev) |
| `DEFAULT_SENDER_HOURLY_QUOTA` | Hourly cap for env-backed Ethereal sender row |
| `SLACK_CLIENT_ID` / `SLACK_CLIENT_SECRET` / `SLACK_REDIRECT_URI` / `SLACK_SCOPES` / `SLACK_NOTIFY_DEBOUNCE_MS` | Optional Slack OAuth + alerts |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_REDIRECT_URI` / `GOOGLE_FRONTEND_CALLBACK_URL` | Optional Google OAuth |
| `ELASTICSEARCH_ENABLED` / `ELASTICSEARCH_URL` / `ELASTICSEARCH_API_KEY` | Optional search |
| `QUEUE_DASHBOARD_ADMIN_EMAILS` | Comma-separated emails allowed to open Bull Board; empty = any signed-in user |
| `VITE_API_BASE_URL` | Frontend API base (default `http://127.0.0.1:3001`) |

## Local ports (Docker Compose)

Host mappings in `docker-compose.yml` (defaults avoid clashing with other local Postgres/Redis on 5432/6379):

| Service | Host port | Container port |
| --- | --- | --- |
| PostgreSQL | **5433** | 5432 |
| Redis | **6380** | 6379 |
| Elasticsearch | **9200** | 9200 |

Example `DATABASE_URL` and `REDIS_URL` (see `.env.example`):

- `postgresql://outbox:outbox@127.0.0.1:5433/outbox_email_scheduler?schema=public`
- `redis://127.0.0.1:6380`

Application URLs when using defaults:

- API: `http://127.0.0.1:3001`
- Frontend: `http://127.0.0.1:5173`

## Running locally

Requires **Node.js 20+** and Docker Compose.

```bash
npm install
cp .env.example .env
# Set JWT_SECRET (16+ chars). Run `npm run ethereal:create` and copy ETHEREAL_* into .env for worker delivery.
npm run docker:up
npm run prisma:generate
npm run prisma:migrate
```

**Four terminals** (PowerShell paths from repo root):

```powershell
# Terminal 1 — infra (once)
npm run docker:up

# Terminal 2 — API
npm run dev:backend

# Terminal 3 — frontend
npm run dev:frontend

# Terminal 4 — worker (required for sends)
npm run worker
```

On Windows, first-time setup: `Copy-Item .env.example .env`.

**Prisma:** `npm run prisma:migrate` runs `prisma migrate dev` from the backend workspace. Ensure `DATABASE_URL` in repo-root `.env` points at `127.0.0.1:5433`. If the Prisma CLI cannot see `DATABASE_URL`, start the API once (which loads `.env`) or export the variable in your shell before migrating.

**Verify stack:**

```bash
npm run lint
npm run test
npm run build
curl "http://127.0.0.1:3001/api/health?verbose=true"
```

PowerShell: `Invoke-RestMethod "http://127.0.0.1:3001/api/health?verbose=true"`

## API endpoints

| Method | Path | Auth |
| --- | --- | --- |
| `POST` | `/api/auth/register` | No |
| `POST` | `/api/auth/login` | No |
| `GET` | `/api/auth/me` | Bearer |
| `GET` | `/api/auth/google/start` | No (503 if Google not configured) |
| `GET` | `/api/auth/google/callback` | No (Google redirect) |
| `POST` | `/api/auth/google/exchange` | No (one-time code from callback) |
| `GET` | `/api/health` | No (`?verbose=true` includes `dependencies.postgres` / `dependencies.redis`) |
| `POST` | `/api/emails` | Bearer |
| `GET` | `/api/emails` | Bearer; `?status=` (`SCHEDULED`/`QUEUED`/`PROCESSING`/`SENT`/`FAILED`) `?limit=` |
| `GET` | `/api/emails/scheduled` | Bearer (`SCHEDULED` + `QUEUED`) |
| `GET` | `/api/emails/sent` | Bearer |
| `GET` | `/api/emails/:id` | Bearer; ownership-scoped |
| `GET` | `/api/emails/search` | Bearer; optional ES (`q`, filters) |
| `POST` | `/api/emails/search/reindex` | Bearer; optional ES |
| `POST` | `/api/campaigns` | Bearer |
| `GET` | `/api/campaigns` | Bearer; `?limit=` |
| `GET` | `/api/campaigns/:id` | Bearer; ownership-scoped |
| `GET` | `/api/smtp-accounts` | Bearer |
| `POST` | `/api/smtp-accounts` | Bearer |
| `PATCH` | `/api/smtp-accounts/:id/enabled` | Bearer |
| `GET` | `/api/slack/status` | Bearer |
| `GET` | `/api/slack/connect` | Bearer (returns OAuth URL) |
| `GET` | `/api/slack/callback` | No (Slack redirect) |
| `DELETE` | `/api/slack/disconnect` | Bearer |
| `POST` | `/api/admin/queues/session` | Bearer; sets httpOnly cookie for Bull Board |
| `GET` | `/api/admin/queues` | Bull Board UI (cookie or Bearer via `bullBoardAuth`) |

There is no dedicated `/failed` path. The dashboard Failed table uses `GET /api/emails?status=FAILED`. `providerMessageId` is stored on the row in PostgreSQL; it is not returned in the public JSON. Preview URLs are worker logs only.

Create body: `{ recipient, subject, body, scheduledAt }` — never `userId`.

### Campaign scheduling (Phase 1)

`POST /api/campaigns` body:

```json
{
  "subject": "Hello",
  "body": "Plain-text body",
  "startAt": "2030-06-01T10:00:00.000Z",
  "minDelayMs": 5000,
  "hourlyQuota": 200,
  "recipients": "one@example.com\ntwo@example.com",
  "idempotencyKey": "optional-client-key"
}
```

- `recipients` is server-parsed CSV or newline-separated text (trimmed, deduplicated, validated). Max payload **2 MB**; max **5,000** unique addresses.
- Each recipient becomes an `Email` row with `campaignId`, `sequenceIndex`, and `scheduledAt = startAt + index * minDelayMs`.
- BullMQ `jobId` remains the email row id. Reconciliation recovers `SCHEDULED` rows after enqueue failures.
- `hourlyQuota` is enforced per campaign per **UTC clock hour** using atomic Redis counters (see Phase 2 notes below).
- Repeat `POST` with the same `idempotencyKey` for a user returns the existing campaign and only enqueues still-`SCHEDULED` child emails (no duplicate rows).

### Phase 2: send engine, quotas, SMTP pool, Slack

**Quota accounting (UTC hours):**

- Campaign quota key: `quota:campaign:{campaignId}:{YYYYMMDDHH}` (UTC).
- Sender quota key: `quota:sender:{senderId}:{YYYYMMDDHH}` (UTC).
- Reservation uses a Lua script: `INCR` only when below limit, plus a per-email hold key so BullMQ retries for the same email in the same hour do not consume additional quota.
- Failed SMTP after reservation: hold is released and the counter is decremented.
- Successful SMTP: reservation is confirmed (per-email hold marked for the hour); the increment remains (counts as a send). Retries for the same email in the same hour do not double-count.
- Crash after reservation but before SMTP: the slot may remain counted until the hour bucket expires (documented trade-off).

**Deferred jobs (quota or min delay):**

- Worker calls `job.moveToDelayed()` and sets the email back to `QUEUED` with updated `scheduledAt` and `deferralReason`.
- Jobs are not marked `SENT`/`FAILED` when deferred.
- Reconciliation continues to use `jobId = email.id` and `scheduledAt` for delay recreation.

**Minimum delay:**

- Campaign `minDelayMs` uses Redis `send:campaign:{id}:last-sent-ms` (updated only after successful SMTP).

**SMTP senders:**

- `GET/POST /api/smtp-accounts`, `PATCH /api/smtp-accounts/:id/enabled`
- Environment `ETHEREAL_*` credentials appear as an auto-provisioned `ENV` sender per user (not disableable).
- Custom Ethereal accounts store encrypted passwords (`CREDENTIALS_ENCRYPTION_KEY`).

**Slack:**

- `GET /api/slack/connect` (returns authorize URL), `GET /api/slack/callback`, `GET /api/slack/status`, `DELETE /api/slack/disconnect`
- Notifications fire when a **sender** hourly quota is hit (debounced via `SLACK_NOTIFY_DEBOUNCE_MS`).

Configure multiple Ethereal accounts with `npm run ethereal:create` for each inbox, then add them under **Settings → SMTP sender accounts**.

### Phase 3: Google OAuth, search, Bull Board

- **Google:** set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `.env`; authorized redirect URI must match `GOOGLE_REDIRECT_URI` (default `http://127.0.0.1:3001/api/auth/google/callback`).
- **Search:** set `ELASTICSEARCH_ENABLED=true` and `ELASTICSEARCH_URL` (default `http://127.0.0.1:9200` with Compose). The API runs an outbox processor on an interval to index `SENT`/`FAILED` mail.
- **Bull Board:** mounted at `/api/admin/queues`. From the app, **Queue dashboard** calls `POST /api/admin/queues/session` and opens the API origin in a new tab so the cookie is sent to the board.

## Project structure

```
/
├── apps/backend/     Express, Prisma client usage, queue, worker
├── apps/frontend/    React SPA
├── prisma/           schema + migrations
├── docker-compose.yml
├── .env.example
└── README.md
```

Backend: `routes` / `controllers` → `services` → `db` / `queue` / `workers`. Worker entry: `apps/backend/src/workers/index.ts`.

## Testing

```bash
npm run lint
npm run test
npm run build
```

Backend tests cover auth, email and campaign APIs, recipient parsing, ownership, queue delay math, worker processor, reconciliation, concurrency, and rate limiting (with a test limiter). Integration tests require PostgreSQL and Redis (`npm run docker:up`). Frontend tests cover local datetime → ISO conversion and API error mapping.

## Demo scenario (≤ 5 minutes)

1. Register/login; open **Dashboard** (scheduled / sent / failed).  
2. **Compose** → single email → schedule ~45–60 seconds ahead → success → Scheduled shows `QUEUED`.  
3. (Optional) **Compose** → campaign → paste duplicate lines in recipients → confirm deduped count and staggered `scheduledAt` in API/DB.  
4. Stop the worker (`Ctrl+C`); row stays `QUEUED` in PostgreSQL.  
5. Start `npm run worker`; watch `[reconcile]` then `[worker] job received`.  
6. Refresh Dashboard → `SENT`; copy **Ethereal preview URL** from worker logs (not returned in API JSON).  
7. **Settings** → SMTP accounts; **Queue dashboard** (if allowed).  
8. Mention search / Google / Slack only if you configured them in `.env`.

Use **test recipients** (e.g. `you@example.com`); delivery goes to **Ethereal**, not real inboxes.

## Assumptions / trade-offs

- SMTP delivery is **at-least-once**. A crash after Ethereal accepts the message and before `SENT` can cause a duplicate on recovery. There is no exactly-once guarantee.
- JWT in **`localStorage`** is appropriate for this assignment, not a hardened cookie/session design.
- **Hourly quota:** Redis Lua scripts enforce limits per UTC hour. If the worker crashes **after** reserving quota but **before** SMTP completes, that slot may stay counted until the hour bucket expires (hold/release cannot run).
- Stale `PROCESSING` uses `updatedAt` vs `EMAIL_PROCESSING_TIMEOUT_MS`. A send slower than that timeout is still protected if the BullMQ job remains `active`.
- No recurring schedules, cancellation UI, or production SMTP providers (Gmail, etc.).
- Optional integration env vars may be empty; the app degrades gracefully (Google 503, search unavailable, Slack disconnected).
- `.env` reliability keys may be omitted; Zod supplies the documented defaults.

## Assignment requirement mapping

| Requirement | Implementation |
| --- | --- |
| Backend scheduler | BullMQ delayed `send-email` jobs, delay from `scheduledAt` |
| Persistence on restart | PostgreSQL Email rows + worker startup reconciliation |
| Rate limiting | BullMQ worker `limiter` (`EMAIL_RATE_LIMIT_*`) |
| Concurrency | `Worker` `concurrency` (`EMAIL_WORKER_CONCURRENCY`) |
| Redis | BullMQ connection (`REDIS_URL`) |
| Database | PostgreSQL + Prisma |
| BullMQ worker | `npm run worker`, separate from Express |
| User login | JWT + bcrypt; optional Google OAuth |
| Dashboard | Scheduled / Sent / Failed tables; campaigns via compose |
| Compose | `/compose` → `POST /api/emails` and `POST /api/campaigns` |
| Ethereal | Nodemailer transport from `ETHEREAL_*` |
| README | This document |
| Demo video | Scenario above (max ~5 minutes) |

## Demo video checklist (≤ 5 minutes)

| Time | Show |
| --- | --- |
| 0:00–0:30 | Login → Dashboard (counts + tables) |
| 0:30–1:15 | Compose, local date/time, Schedule email |
| 1:15–1:45 | Dashboard Scheduled `QUEUED` |
| 1:45–2:30 | Stop worker; DB still `QUEUED`; start worker; `[reconcile]` logs |
| 2:30–3:15 | Refresh → `SENT`, `sentAt` |
| 3:15–4:00 | Ethereal preview URL / inbox |
| 4:00–4:45 | Worker logs: `active=`, limiter, concurrency=2 |
| 4:45–5:00 | One-slide architecture: API → PG → BullMQ → Worker → Ethereal |
