# Outbox Email Scheduler

Production-minded email scheduling application for the Outbox Labs technical assignment. The backend is a **durable asynchronous job-processing system**: PostgreSQL is the source of truth, Redis/BullMQ executes delayed work, and a separate worker delivers mail through Nodemailer + Ethereal.

This is not a ReachInbox clone. There are no campaigns, contacts, AI generation, or production inbox providers.

## Project overview

An authenticated user can register, log in, compose a plain-text email, schedule it for a future time, and review scheduled, sent, and failed deliveries on a dashboard. The HTTP API never sends mail inline. A worker process claims due jobs, talks to Ethereal SMTP, and writes `SENT` or `FAILED` back to PostgreSQL.

## Features

- Registration, login, JWT sessions, and `GET /api/auth/me`
- Per-user email ownership (backend-enforced)
- Compose and schedule emails for a future instant
- Delayed BullMQ jobs (`jobId = email.id`, payload `{ emailId }` only)
- Independent worker with Nodemailer / Ethereal delivery
- Atomic `QUEUED → PROCESSING` claim; `SENT` / `FAILED` outcomes
- BullMQ retries (3 attempts, exponential backoff)
- Worker concurrency and rate limiting
- Startup reconciliation of DB vs queue (including stale `PROCESSING`)
- Dashboard: scheduled, sent, failed; compose form; local-timezone display

## Tech stack

| Area | Choice |
| --- | --- |
| Frontend | React, Vite, TypeScript, Tailwind CSS |
| Backend | Node.js, Express, TypeScript |
| Database | PostgreSQL, Prisma |
| Queue | Redis, BullMQ |
| Email | Nodemailer, Ethereal Email |
| Auth | JWT (`sub` = user id), bcrypt |
| Local infra | Docker Compose (PostgreSQL + Redis only) |

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
- Frontend stores the token in `localStorage` and sends `Authorization: Bearer`.
- Email ownership is always `req.user.id` on the server. `GET /api/emails/:id` returns 404 for another user's mail.

## Ethereal setup

```bash
npm run ethereal:create
```

Copy the printed `ETHEREAL_*` values into the repo-root `.env`. Restart the worker. Do not commit credentials. Preview URLs are logged; they are not stored as `providerMessageId`.

If `ETHEREAL_USER` / `ETHEREAL_PASS` are empty, the worker starts but delivery fails permanently and does **not** mark `SENT`.

## Environment variables

Copy `.env.example` to `.env`. Do not commit `.env`.

| Variable | Role |
| --- | --- |
| `NODE_ENV` | `development` / `test` / `production` |
| `PORT` | API port (default 3001) |
| `FRONTEND_URL` | CORS origin |
| `DATABASE_URL` | PostgreSQL |
| `REDIS_URL` | Redis |
| `JWT_SECRET` | JWT signing (≥ 16 chars) |
| `JWT_EXPIRES_IN` | e.g. `7d` |
| `ETHEREAL_HOST` / `PORT` / `SECURE` / `USER` / `PASS` | SMTP |
| `MAIL_FROM` | From header |
| `EMAIL_WORKER_CONCURRENCY` | Max in-flight jobs |
| `EMAIL_RATE_LIMIT_MAX` | Limiter max |
| `EMAIL_RATE_LIMIT_DURATION_MS` | Limiter window |
| `EMAIL_PROCESSING_TIMEOUT_MS` | Stale `PROCESSING` threshold |
| `VITE_API_BASE_URL` | Frontend API base |

## Running locally

Requires Node.js 20+ and Docker Compose.

```bash
npm install
cp .env.example .env
# edit JWT_SECRET; add Ethereal via npm run ethereal:create
npm run docker:up
npm run prisma:generate
npm run prisma:migrate
npm run dev:backend    # http://127.0.0.1:3001
npm run dev:frontend    # http://127.0.0.1:5173
npm run worker          # separate terminal
```

On Windows PowerShell: `Copy-Item .env.example .env`.

## API endpoints

| Method | Path | Auth |
| --- | --- | --- |
| `POST` | `/api/auth/register` | No |
| `POST` | `/api/auth/login` | No |
| `GET` | `/api/auth/me` | Bearer |
| `GET` | `/api/health` | No (`?verbose=true` for DB/Redis) |
| `POST` | `/api/emails` | Bearer |
| `GET` | `/api/emails` | Bearer; `?status=` (`SCHEDULED`/`QUEUED`/`PROCESSING`/`SENT`/`FAILED`) `?limit=` |
| `GET` | `/api/emails/scheduled` | Bearer (`SCHEDULED` + `QUEUED`) |
| `GET` | `/api/emails/sent` | Bearer |
| `GET` | `/api/emails/:id` | Bearer; ownership-scoped |

There is no dedicated `/failed` path. The dashboard Failed table uses `GET /api/emails?status=FAILED`. `providerMessageId` is stored on the row in PostgreSQL; it is not returned in the public JSON. Preview URLs are worker logs only.

Create body: `{ recipient, subject, body, scheduledAt }` — never `userId`.

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

Backend tests cover auth, email API, ownership, queue delay math, worker processor, reconciliation, concurrency, and rate limiting (with a test limiter). Frontend tests cover local datetime → ISO conversion and API error mapping.

## Demo scenario

1. Register/login; open Dashboard (empty or existing mail).  
2. Compose: schedule ~45 seconds ahead; see success; Scheduled table shows `QUEUED`.  
3. Stop the worker (`Ctrl+C`); confirm the row is still in PostgreSQL.  
4. Start `npm run worker` again; watch `[reconcile]` then `[worker] job received`.  
5. Refresh Dashboard → `SENT`; open the logged Ethereal preview URL.  
6. Optionally show worker logs with `active=1|2` and limiter spacing.

## Assumptions / trade-offs

- SMTP delivery is **at-least-once**. A crash after Ethereal accepts the message and before `SENT` can cause a duplicate on recovery. There is no exactly-once guarantee.
- JWT in `localStorage` is appropriate for this assignment, not a hardened cookie/session design.
- Stale `PROCESSING` uses `updatedAt` vs `EMAIL_PROCESSING_TIMEOUT_MS`. A send slower than that timeout is still protected if the BullMQ job remains `active`.
- No recurring schedules, cancellation, campaigns, contacts, or production providers (Gmail, etc.).
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
| User login | JWT + bcrypt; frontend login/register |
| Dashboard | Scheduled / Sent / Failed tables |
| Compose | `/compose` → `POST /api/emails` |
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
