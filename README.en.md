# Tech Week Reservation — Fontanella SRL Challenge

[Español](README.md) | [English](README.en.md)

A web application for client companies to check room availability and manage their
bookings. Administrators manage buildings and rooms, inspect a global agenda and
analyze utilization by room, building and company.

The implementation prioritizes **preventing concurrent overlaps**, **isolating each
company's bookings** and **preserving history**. It includes operation feedback,
conflict errors and utilization reports cached in Redis.

## Run from a fresh clone

Requirements: Node.js **24**, npm **11+**, Docker and Docker Compose. Local ports:
3000, 3001, 5432 and 6379. With nvm, run `nvm install` and `nvm use` in the repository.

```bash
git clone https://github.com/lean4339/Tech_week_reservation.git
cd Tech_week_reservation
npm ci
cp .env.example .env
cp apps/backend/.env.example apps/backend/.env
cp apps/frontend/.env.example apps/frontend/.env.local
npm run db:up
npm run db:migrate
npm run admin:create
npm run dev
```

Copy environment files only for the first installation; preserve existing settings.
Examples match Compose and are intended for local development. Admin creation is
interactive: enter an email and a hidden **15–128 character** password. Spaces and
Unicode are allowed, no uppercase/digit/symbol combination is mandatory, and known
blocked common passwords are rejected. The command explains errors and allows retries.
It does not promote existing accounts. Public signup cannot create administrators.

- Application: <http://127.0.0.1:3000>.
- Backend: <http://127.0.0.1:3001/health>.
- Backend through Next.js: <http://127.0.0.1:3000/api/health>.

Both health endpoints should return `{"status":"ok"}`. PostgreSQL and Redis must
be available at startup; migrations also run automatically. There are no preloaded
accounts or rooms: sign in as admin, create one building and three rooms. Client
companies register at `/signup`, then sign in at `/login`.
[Evaluation walkthrough and example data](DELIVERY.md).

Ctrl+C stops the applications. `npm run db:down` stops containers while preserving
volumes. Resume with `npm run db:up` and `npm run dev`.
[Detailed setup and troubleshooting](RUNNING.md).

## Test and build

```bash
npm run check                 # ESLint, TypeScript and formatting
npm run build                 # Build both applications
npm test                      # Local tests, no Docker required
npx playwright install chromium
npm run test:services:up
npm run test:all               # npm audit, local, timing, integration and E2E
npm run test:services:down
```

On Linux, if Playwright reports missing system libraries, run
`npx playwright install --with-deps chromium`. Integration and E2E use PostgreSQL
55432, Redis 56379/DB 15 and applications 3100/3101, separate from development data.
Audits require npm registry access; network failures also fail validation.

`npm ci` installs a local pre-commit hook running dependency auditing, hook checks,
TypeScript, formatting, local tests and timing. ESLint, integration and E2E run
separately with the commands above. Unit, modular, regression and E2E suites are
explained in [TESTING.md](TESTING.md). Latest verified results: [DELIVERY.md](DELIVERY.md).

## Features

| Role           | Screens and operations                                                                                               |
| -------------- | -------------------------------------------------------------------------------------------------------------------- |
| Client company | `/dashboard`: catalog, availability and direct booking; `/reservations`: own bookings, rescheduling and cancellation |
| Administrator  | `/admin`: global agenda with optional company, room, building and date filters                                       |
| Administrator  | `/admin/buildings` and `/admin/rooms`: create, edit, assign and deactivate                                           |
| Administrator  | `/admin/metrics`: usage, cancellations, rankings, low-use periods and commercial follow-up                           |
| Administrator  | `/admin/activity`: authentication and request events stored in Redis                                                 |

Date filters are optional when listing bookings. The catalog opens without a time
range; availability checks require start/end times. Checking availability does not
hold a room: PostgreSQL confirms the booking and a competing request can receive 409. Cancellation retains the record and releases its interval.

## Architecture and decisions

Next.js with React/TypeScript, Fastify with Node.js/TypeScript, PostgreSQL 18 and
Redis 8. An npm workspaces monorepo coordinates installation, scripts and versions.

- **One client account represents one company**, using its user ID and
  `business_name`; organizations with multiple staff accounts are outside this version.
- **PostgreSQL is authoritative**: foreign keys and GiST exclusion over `[start, end)`
  intervals prevent overlapping bookings; writes use transactions.
- **No N+1 agenda queries**: JOINs retrieve room, building and company details,
  with ownership filters and pagination enforced in SQL.
- **Responsibilities are separated**: `http/admin`, `http/client` and a read-only
  catalog; per-domain services and repositories under `modules`. Shared authentication
  runs before handlers and permissions are checked on the server.
- **Redis** stores sessions, rate limits, security events and cached metrics.
  PostgreSQL computes reports with transactional revision invalidation. Redis does
  not replace persistent booking storage.

[Architecture and boundaries](ARCHITECTURE.md) · [Design reasoning](DECISIONS.md) ·
[API](BUSINESS_API.md) · [Metrics and formulas](METRICS.md).

## Assumptions, limitations and next version

Bookings are continuous periods of at most 366 days, starting in the future. There
are no recurrence rules or opening hours. Forms use the device time zone, PostgreSQL
stores timezone-aware instants, and reports aggregate in UTC.
Occupancy is **theoretical, based on 24 hours per room since creation**, including
currently inactive rooms. It does not measure attendance or revenue. Commercial
opportunities are visible heuristics, not automatic discounts. Rankings show up to
100 entries.

The scope is local: no cloud deployment, payments, password recovery, email
verification or MFA. Proxy trust is not enabled. Responses use HTTP statuses and
messages; uniform application codes and response schemas remain future work.
No claim of absolute security or exhaustive OWASP compliance is made.

Next steps: business opening hours and closure history, multiple staff per company,
recurring bookings, consistent response contracts, load testing and remote CI.
The latest npm audit found no advisories; **ESLint 9 remains end-of-life** and a
compatible migration is pending. Docker images and the OS were not scanned.
[Dependency audit](DEPENDENCY_AUDIT.md) · [Security review](SECURITY_REVIEW.md).

## Use of artificial intelligence

I used **OpenAI Codex** to implement and refactor TypeScript/SQL, generate tests,
run checks and prepare documentation. I used **my own `security-review` skill,
which I created**, to guide authentication, authorization, cryptography, timing
and security-test reviews using OWASP references. Technical direction, priorities and supervision
were mine; responsibility for the delivered implementation remains with me.

I selected the stack and requested incremental work: setup, business model, CRUD,
interface and metrics. My questions and corrections shaped the result: one account
per company, no N+1 queries, role-restricted writes, four test categories, pre-commit
checks, IP request logging, cryptographic review, timing diagnostics and dependency
auditing.

I corrected AI proposals that mixed responsibilities or produced an unsuitable
workflow: shared authentication middleware, separate administrator/client routes,
buildings, optional date filters and business management screens replacing a
logs-centered admin view. I also requested explicit password requirements and
rejected treating the OWASP review as complete without a dependency audit.
Cryptographic checks covered scrypt, hash comparison, Unicode passwords, random
tokens and session keys derived by hashing tokens. Functionality claims rely on
executed tests; timing diagnostics and audits retain
explicit limitations. [Detailed decision record](DECISIONS.md).
